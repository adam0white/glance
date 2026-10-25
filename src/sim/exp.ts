// biome-ignore-all lint/correctness/noPrecisionLoss: retain HF/fdlibm constants digit for digit.

/*! @license
 * ====================================================
 * Copyright (C) 2004 by Sun Microsystems, Inc. All rights reserved.
 *
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */
/**
 * Deterministic exponential for Glance water only. Extracted without arithmetic changes from
 * Human Framework 2.21.0 core/libm (Adam White, MIT), a port of Sun/FreeBSD fdlibm e_exp.c.
 * HF does not publicly export it. Keep this small local copy until a public API is available.
 *
 * Both callers supply nonpositive exponents: Gaussian -((m-at)/width)^2/2 and
 * drainage -dryHours*60/70. Current storms use m in [0,480], giving x in [-55.125,0];
 * the 14-hour day uses x=-12. The implementation handles the full binary64 domain,
 * including underflow, so custom storms need no cutoff. For normal results fdlibm's
 * error is <1 ulp (relative <2^-52); allow one minimum subnormal unit at underflow.
 * This bounds exp itself, not accumulated simulation error. No model values are rounded.
 * Only binary64 basic arithmetic, exact integer/bit operations and DataView word edits
 * determine the result. Do not replace this with host Math.exp or reassociate its arithmetic.
 */
const buf = new DataView(new ArrayBuffer(8));
/** Signed high 32 bits of a double. */
function hi(x: number): number {
  buf.setFloat64(0, x, false);
  return buf.getInt32(0, false);
}
/** `x` with its high word replaced. */
function withHi(x: number, h: number): number {
  buf.setFloat64(0, x, false);
  buf.setInt32(0, h | 0, false);
  return buf.getFloat64(0, false);
}
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = Math.LOG2E; // fdlibm's 1.44269504088896338700 parses to this same double
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const TWOM1000 = 9.3326361850321887899e-302;

/** e^x, identical on every platform (fdlibm e_exp.c). */
export function dexp(x: number): number {
  let hx = hi(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (Number.isNaN(x)) return x;
      return xsb === 0 ? x : 0;
    }
    if (x > O_THRESHOLD) return Number.POSITIVE_INFINITY;
    if (x < U_THRESHOLD) return 0;
  }
  let k = 0;
  let h = 0;
  let l = 0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      h = xsb === 0 ? x - LN2_HI : x + LN2_HI;
      l = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INV_LN2 * x + (xsb === 0 ? 0.5 : -0.5));
      h = x - k * LN2_HI;
      l = k * LN2_LO;
    }
    x = h - l;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (l - (x * c) / (2 - c) - h);
  if (k >= -1021) return withHi(y, hi(y) + k * 0x100000);
  return withHi(y, hi(y) + (k + 1000) * 0x100000) * TWOM1000;
}
