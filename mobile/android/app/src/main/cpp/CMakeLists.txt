cmake_minimum_required(VERSION 3.18)
project(hindsight_sf LANGUAGES CXX)

# Download the ~1.1 MiB StockfishLight NNUE net into CMAKE_BINARY_DIR (where .incbin resolves).
set(NNUE_FILE "${CMAKE_BINARY_DIR}/nn-61e7af4bb97d.nnue")
if(NOT EXISTS "${NNUE_FILE}")
  file(DOWNLOAD
    https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue
    "${NNUE_FILE}"
    EXPECTED_HASH SHA256=61e7af4bb97d51eeeb25d322916f86513b5cd3a827ce189c98c6e31946f99e5b
    SHOW_PROGRESS
  )
endif()

# 1. Shared NNUE data + CPU feature probe (loaded once so arm64 NEON & dotprod don't duplicate the net).
add_library(hindsight_nnue SHARED nnue_data.cpp)
target_compile_options(hindsight_nnue PRIVATE -std=c++17 -O3 -fno-exceptions "-Wa,-I,${CMAKE_BINARY_DIR}")
target_link_options(hindsight_nnue PRIVATE "-Wl,-z,max-page-size=16384")

file(GLOB_RECURSE SF_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/stockfish/src/*.cpp")

function(add_sf_variant TARGET_NAME EXTRA_FLAGS)
  add_library(${TARGET_NAME} SHARED engine_ffi.cpp ${SF_SOURCES})
  target_link_libraries(${TARGET_NAME} PRIVATE hindsight_nnue)
  # Always optimize even in Flutter Debug/Profile builds (otherwise ~30x slower).
  target_compile_options(${TARGET_NAME} PRIVATE
    -std=c++17
    -O3
    -flto
    -fno-exceptions
    -funroll-loops
    -DNDEBUG
    -DUSE_PTHREADS
    -DUNIVERSAL_BINARY
    ${EXTRA_FLAGS}
  )
  target_link_options(${TARGET_NAME} PRIVATE
    -flto
    "-Wl,-z,max-page-size=16384"
  )
endfunction()

if(ANDROID_ABI STREQUAL "arm64-v8a")
  add_sf_variant(hindsight_sf "-DIS_64BIT;-DUSE_POPCNT;-DUSE_NEON=8")
  add_sf_variant(hindsight_sf_dotprod "-DIS_64BIT;-DUSE_POPCNT;-DUSE_NEON=8;-march=armv8.2-a+dotprod;-DUSE_NEON_DOTPROD")
elseif(ANDROID_ABI STREQUAL "x86_64")
  add_sf_variant(hindsight_sf "-DIS_64BIT;-DUSE_POPCNT")
else()
  add_sf_variant(hindsight_sf "")
endif()
