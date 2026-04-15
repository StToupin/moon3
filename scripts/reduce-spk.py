#!/usr/bin/env python3

"""Build a smaller SPK by copying only the bodies this app uses.

Example:
  python3 scripts/reduce-spk.py /path/to/de432s.bsp spice/de432s.bsp

Dependencies:
  python3 -m pip install spiceypy numpy
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import spiceypy as spice

KEEP_BODIES = {10, 3, 399, 301}
COMMENT_LINES = [
  "Reduced DE432s subset for Moon3.",
  "Copied from an upstream SPK without resampling.",
  "Included bodies: 10 (SUN), 3 (EARTH BARYCENTER), 399 (EARTH), 301 (MOON).",
]


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description=(
      "Copy only the Sun/Earth/Moon segments from an upstream planetary SPK."
    ),
  )
  parser.add_argument("source", type=Path, help="Path to the full source SPK.")
  parser.add_argument("output", type=Path, help="Path for the reduced SPK.")
  return parser.parse_args()


def frame_name(frame_code: int) -> str:
  name = spice.frmnam(frame_code)
  if not name:
    raise ValueError(f"Unknown frame code {frame_code}")
  return name


def segment_id(body: int, center: int) -> str:
  body_name = spice.bodc2n(body) or str(body)
  center_name = spice.bodc2n(center) or str(center)
  return f"MOON3 {body_name} WRT {center_name}"[:40]


def write_type_2_segment(
  output_handle: int,
  *,
  body: int,
  center: int,
  frame_code: int,
  first: float,
  last: float,
  raw_segment: np.ndarray,
) -> None:
  begin_time, interval_length, record_size, record_count = raw_segment[-4:]
  record_size = int(round(record_size))
  record_count = int(round(record_count))
  polynomial_degree = (record_size - 2) // 3 - 1

  records = raw_segment[:-4].reshape((record_count, record_size))
  coefficients = records[:, 2:].reshape(-1)

  spice.spkw02(
    output_handle,
    body,
    center,
    frame_name(frame_code),
    first,
    last,
    segment_id(body, center),
    float(interval_length),
    record_count,
    polynomial_degree,
    coefficients,
    float(begin_time),
  )


def write_type_3_segment(
  output_handle: int,
  *,
  body: int,
  center: int,
  frame_code: int,
  first: float,
  last: float,
  raw_segment: np.ndarray,
) -> None:
  begin_time, interval_length, record_size, record_count = raw_segment[-4:]
  record_size = int(round(record_size))
  record_count = int(round(record_count))
  polynomial_degree = (record_size - 2) // 6 - 1

  records = raw_segment[:-4].reshape((record_count, record_size))
  coefficients = records[:, 2:].reshape(-1)

  spice.spkw03(
    output_handle,
    body,
    center,
    frame_name(frame_code),
    first,
    last,
    segment_id(body, center),
    float(interval_length),
    record_count,
    polynomial_degree,
    coefficients,
    float(begin_time),
  )


def main() -> None:
  args = parse_args()
  if not args.source.is_file():
    raise FileNotFoundError(f"Missing source SPK: {args.source}")

  args.output.parent.mkdir(parents=True, exist_ok=True)
  if args.output.exists():
    args.output.unlink()

  input_handle = spice.dafopr(str(args.source))
  output_handle = spice.spkopn(str(args.output), "MOON3 SUBSET", 2048)
  spice.dafac(output_handle, COMMENT_LINES)

  copied_bodies: list[int] = []

  try:
    spice.dafbfs(input_handle)
    while spice.daffna():
      descriptor = spice.dafgs(5)
      body, center, frame_code, segment_type, first, last, begin, end = spice.spkuds(
        descriptor,
      )

      if body not in KEEP_BODIES:
        continue

      raw_segment = np.array(
        spice.dafgda(input_handle, begin, end),
        dtype=np.float64,
      )

      if segment_type == 2:
        write_type_2_segment(
          output_handle,
          body=body,
          center=center,
          frame_code=frame_code,
          first=first,
          last=last,
          raw_segment=raw_segment,
        )
      elif segment_type == 3:
        write_type_3_segment(
          output_handle,
          body=body,
          center=center,
          frame_code=frame_code,
          first=first,
          last=last,
          raw_segment=raw_segment,
        )
      else:
        raise ValueError(
          f"Unsupported SPK segment type {segment_type} for body {body}",
        )

      copied_bodies.append(body)
  finally:
    spice.dafcls(input_handle)
    spice.spkcls(output_handle)

  missing_bodies = KEEP_BODIES.difference(copied_bodies)
  if missing_bodies:
    raise ValueError(f"Missing required bodies in source SPK: {sorted(missing_bodies)}")

  print(
    f"Copied {len(copied_bodies)} segments into {args.output} "
    f"({args.output.stat().st_size} bytes).",
  )


if __name__ == "__main__":
  main()
