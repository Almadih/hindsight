#include <cstdint>

#if defined(__aarch64__) && defined(__linux__)
#include <sys/auxv.h>
#ifndef HWCAP_ASIMDDP
#define HWCAP_ASIMDDP (1UL << 20)
#endif
#endif

#define INCBIN_SILENCE_BITCODE_WARNING
#include "stockfish/src/incbin/incbin.h"
#include "stockfish/src/evaluate.h"

// Embed the ~1.1 MiB StockfishLight NNUE once in libhindsight_nnue.so so NEON
// and dotprod engine libraries share it without duplicating APK weight.
INCBIN(EmbeddedNNUE, EvalFileDefaultName);

extern "C" __attribute__((visibility("default"))) int32_t sf_has_dotprod(void) {
#if defined(__aarch64__) && defined(__linux__)
    return (getauxval(AT_HWCAP) & HWCAP_ASIMDDP) != 0 ? 1 : 0;
#else
    return 0;
#endif
}
