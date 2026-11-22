#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "stockfish/src/attacks.h"
#include "stockfish/src/engine.h"
#include "stockfish/src/misc.h"
#include "stockfish/src/position.h"
#include "stockfish/src/score.h"
#include "stockfish/src/search.h"

#define SF_EXPORT extern "C" __attribute__((visibility("default")))
#define SF_MAX_LINES 3
#define SF_PV_MAX_MOVES 20
#define SF_PV_BUF 256

using namespace StockfishLight;

struct SfLine {
    int32_t valid;
    int32_t is_mate;
    int32_t score;
    char    pv[SF_PV_BUF];
};

struct SfResult {
    int32_t count;
    SfLine  lines[SF_MAX_LINES];
};

namespace {

std::once_flag g_init_once;
std::mutex     g_lifecycle_mu;

void set_option(Engine& engine, const std::string& name, const std::string& value) {
    std::istringstream iss("name " + name + " value " + value);
    engine.get_options().setoption(iss);
}

void copy_pv(std::string_view pv, char* dst, size_t cap) {
    size_t out_len = 0;
    int    moves   = 0;
    size_t i       = 0;
    while (i < pv.size() && moves < SF_PV_MAX_MOVES) {
        while (i < pv.size() && pv[i] == ' ') ++i;
        if (i >= pv.size()) break;
        size_t start = i;
        while (i < pv.size() && pv[i] != ' ') ++i;
        size_t tok_len = i - start;
        size_t needed  = tok_len + (out_len > 0 ? 1 : 0);
        if (out_len + needed >= cap) break;
        if (out_len > 0) dst[out_len++] = ' ';
        std::memcpy(dst + out_len, pv.data() + start, tok_len);
        out_len += tok_len;
        ++moves;
    }
    dst[out_len] = '\0';
}

struct Worker {
    Engine engine;
    int    current_multipv = 1;

    explicit Worker(int hash_mb) {
        // Mandatory under -fno-exceptions: Engine::go() invokes onVerifyNetwork without a null check.
        engine.set_on_verify_network([](std::string_view) {});
        engine.set_on_update_no_moves([](const Engine::InfoShort&) {});
        engine.set_on_iter([](const Engine::InfoIter&) {});
        engine.set_on_bestmove([](std::string_view, std::string_view) {});
        engine.set_on_start([]() {});
        set_option(engine, "Threads", "1");
        if (hash_mb > 0 && hash_mb != 16) {
            set_option(engine, "Hash", std::to_string(hash_mb));
        }
    }
};

}  // namespace

SF_EXPORT void* sf_create(int32_t hash_mb) {
    std::call_once(g_init_once, []() {
        Attacks::init();
        Position::init();
    });
    std::lock_guard<std::mutex> lock(g_lifecycle_mu);
    return new Worker(hash_mb > 0 ? hash_mb : 16);
}

SF_EXPORT void sf_clear(void* handle) {
    if (!handle) return;
    // Engine::search_clear() calls global Tablebases::init(), so serialize across workers.
    std::lock_guard<std::mutex> lock(g_lifecycle_mu);
    static_cast<Worker*>(handle)->engine.search_clear();
}

SF_EXPORT void sf_stop(void* handle) {
    if (!handle) return;
    // Lock-free atomic stop flag inside Stockfish ThreadPool.
    static_cast<Worker*>(handle)->engine.stop();
}

SF_EXPORT void sf_destroy(void* handle) {
    if (!handle) return;
    std::lock_guard<std::mutex> lock(g_lifecycle_mu);
    auto* w = static_cast<Worker*>(handle);
    w->engine.stop();
    w->engine.wait_for_search_finished();
    delete w;
}

SF_EXPORT int32_t sf_search(
    void*       handle,
    const char* fen,
    int32_t     depth,
    int64_t     nodes,
    int32_t     movetime_ms,
    int32_t     multipv,
    const char* searchmoves_space_sep,
    SfResult*   out) {
    if (!handle || !fen || !out) return -1;
    std::memset(out, 0, sizeof(SfResult));

    auto* w      = static_cast<Worker*>(handle);
    int   mpv    = std::clamp<int>(multipv, 1, SF_MAX_LINES);
    if (w->current_multipv != mpv) {
        set_option(w->engine, "MultiPV", std::to_string(mpv));
        w->current_multipv = mpv;
    }

    if (w->engine.set_position(fen, {}).has_value()) {
        return -2;
    }

    SfLine slots[SF_MAX_LINES];
    std::memset(slots, 0, sizeof(slots));
    bool early_stopped = false;

    w->engine.set_on_update_full([&](const Engine::InfoFull& info) {
        if (!info.bound.empty() || info.pv.empty()) return;
        if (info.multiPV < 1 || info.multiPV > static_cast<usize>(SF_MAX_LINES)) return;

        int32_t is_mate = 0;
        int32_t val     = 0;
        if (info.score.is<Score::Mate>()) {
            int plies = info.score.get<Score::Mate>().plies;
            is_mate   = 1;
            val       = (plies > 0 ? (plies + 1) : plies) / 2;
        } else if (info.score.is<Score::InternalUnits>()) {
            val = info.score.get<Score::InternalUnits>().value;
        } else if (info.score.is<Score::Tablebase>()) {
            auto tb = info.score.get<Score::Tablebase>();
            val     = (tb.win ? 20000 : -20000) - tb.plies;
        }

        SfLine& slot = slots[info.multiPV - 1];
        slot.valid   = 1;
        slot.is_mate = is_mate;
        slot.score   = val;
        copy_pv(info.pv, slot.pv, SF_PV_BUF);

        if (!early_stopped && info.multiPV == 1 && is_mate
            && info.depth >= std::min(2 * std::abs(val), 10)) {
            early_stopped = true;
            w->engine.stop();
        }
    });

    Search::LimitsType limits;
    limits.startTime = now();
    if (depth > 0) limits.depth = depth;
    if (nodes > 0) limits.nodes = static_cast<u64>(nodes);
    if (movetime_ms > 0) limits.movetime = static_cast<TimePoint>(movetime_ms);
    if (searchmoves_space_sep && searchmoves_space_sep[0] != '\0') {
        std::istringstream iss(searchmoves_space_sep);
        std::string        mv;
        while (iss >> mv) {
            limits.searchmoves.push_back(std::move(mv));
        }
    }

    w->engine.go(limits);
    w->engine.wait_for_search_finished();
    w->engine.set_on_update_full([](const Engine::InfoFull&) {});

    int32_t n = 0;
    for (int i = 0; i < mpv; ++i) {
        if (slots[i].valid && slots[i].pv[0] != '\0') {
            out->lines[n++] = slots[i];
        }
    }
    out->count = n;
    return n;
}
