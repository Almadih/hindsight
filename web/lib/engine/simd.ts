/**
 * WebAssembly 128-bit SIMD detection.
 * Validates a minimal wasm module using the i8x16.splat (0xfd 0x0f) SIMD instruction.
 */
let simdSupported: boolean | null = null;

export async function hasWasmSimd(): Promise<boolean> {
  if (simdSupported !== null) return simdSupported;
  if (typeof WebAssembly !== "object" || typeof WebAssembly.validate !== "function") {
    simdSupported = false;
    return false;
  }
  try {
    // Minimal valid wasm module containing a SIMD i8x16.splat operation
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // \0asm
      0x01, 0x00, 0x00, 0x00, // version 1
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type section: () -> v128
      0x03, 0x02, 0x01, 0x00, // function section: fn 0 of type 0
      0x0a, 0x08, 0x01, 0x06, 0x00, // code section (size 8, 1 func, size 6, 0 locals)
      0x41, 0x00, // i32.const 0
      0xfd, 0x0f, // i8x16.splat
      0x0b, // end
    ]);
    simdSupported = WebAssembly.validate(bytes);
  } catch {
    simdSupported = false;
  }
  return simdSupported;
}
