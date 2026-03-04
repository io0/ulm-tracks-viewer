#!/usr/bin/env python3
"""Export ULM tracks from pkl to compact binary format for the web viewer.

Usage:
    python export_tracks.py --input <pkl> --output-dir ulm-tracks/data/ --min-length 35

Binary format (tracks.bin):
    Header (64 bytes):
        0:  uint32  magic         0x554C4D54 ("ULMT")
        4:  uint32  version       2
        8:  uint32  n_tracks
        12: uint32  total_points
        16: float32 max_speed     (mm/frame, after smoothing)
        20: 3xf32   bounds_min    (x_min, y_min, z_min) mm
        32: 3xf32   bounds_max    (x_max, y_max, z_max) mm
        44: padding to 64 bytes

    Track Table (n_tracks x 8 bytes):
        Per track: uint32 point_offset, uint32 length

    Point Data (total_points x 20 bytes):
        Per point: float32 x, float32 y, float32 z, float32 frame_index, float32 speed
"""

import argparse
import pickle
import struct
import os
import numpy as np
from scipy.ndimage import gaussian_filter1d


def smooth_track_speeds(positions, frames, sigma=3.0):
    """Compute Gaussian-smoothed speed (mm/frame) at each point along a track.

    Velocity is computed from finite differences, then each component is
    smoothed with a 1D Gaussian, and the speed is taken as the magnitude.
    """
    n = len(positions)
    if n < 2:
        return np.zeros(n, dtype=np.float32)

    # Finite-difference velocity at each segment midpoint
    dp = np.diff(positions, axis=0)  # (N-1, 3)
    df = np.diff(frames).astype(np.float64)  # (N-1,)
    df[df == 0] = 1.0

    vel = dp / df[:, np.newaxis]  # (N-1, 3) mm/frame

    # Extend to N points by duplicating endpoints
    vel_full = np.empty((n, 3), dtype=np.float64)
    vel_full[0] = vel[0]
    vel_full[-1] = vel[-1]
    # Average adjacent segments for interior points
    vel_full[1:-1] = 0.5 * (vel[:-1] + vel[1:])

    # Gaussian smooth each velocity component independently
    if n > 2 * sigma:
        for axis in range(3):
            vel_full[:, axis] = gaussian_filter1d(vel_full[:, axis], sigma=sigma)

    # Speed = magnitude
    speeds = np.linalg.norm(vel_full, axis=1).astype(np.float32)
    return speeds


def export_tracks(input_path, output_dir, min_length=35, use_smoothed=True, sigma=3.0):
    print(f"Loading {input_path}...")
    with open(input_path, "rb") as f:
        data = pickle.load(f)

    key = "tracks_smoothed" if use_smoothed and "tracks_smoothed" in data else "tracks"
    all_tracks = data[key]
    print(f"Total tracks ({key}): {len(all_tracks)}")

    # Filter by minimum length
    tracks = [t for t in all_tracks if t["length"] >= min_length]
    print(f"Tracks with length >= {min_length}: {len(tracks)}")

    if len(tracks) == 0:
        print("No tracks pass the filter. Try a lower --min-length.")
        return

    n_tracks = len(tracks)
    total_points = sum(t["length"] for t in tracks)

    # Pre-compute smoothed speeds for all tracks
    max_speed = 0.0
    all_mins = []
    all_maxs = []
    all_speeds = []

    for t in tracks:
        pos = t["positions"]  # (N, 3) in mm
        frames = t["frames"]  # (N,)
        all_mins.append(pos.min(axis=0))
        all_maxs.append(pos.max(axis=0))

        speeds = smooth_track_speeds(pos, frames, sigma=sigma)
        all_speeds.append(speeds)
        if len(speeds) > 0:
            track_max = speeds.max()
            if track_max > max_speed:
                max_speed = float(track_max)

    bounds_min = np.min(all_mins, axis=0).astype(np.float32)
    bounds_max = np.max(all_maxs, axis=0).astype(np.float32)

    print(f"Total points: {total_points}")
    print(f"Max speed (smoothed, sigma={sigma}): {max_speed:.4f} mm/frame")
    print(f"Bounds min: {bounds_min}")
    print(f"Bounds max: {bounds_max}")
    print(
        f"Estimated file size: {(64 + n_tracks * 8 + total_points * 20) / 1e6:.1f} MB"
    )

    # Build binary
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "tracks.bin")

    with open(output_path, "wb") as f:
        # Header (64 bytes)
        header = struct.pack(
            "<IIIIf3f3f",
            0x554C4D54,  # magic "ULMT"
            2,  # version
            n_tracks,
            total_points,
            max_speed,
            *bounds_min.tolist(),
            *bounds_max.tolist(),
        )
        header += b"\x00" * (64 - len(header))
        f.write(header)

        # Track table
        offset = 0
        for t in tracks:
            length = t["length"]
            f.write(struct.pack("<II", offset, length))
            offset += length

        # Point data: x, y, z, frame, speed per point (20 bytes each)
        for t, speeds in zip(tracks, all_speeds):
            pos = t["positions"].astype(np.float32)  # (N, 3)
            frames = t["frames"].astype(np.float32)  # (N,)
            point_data = np.column_stack(
                [pos, frames[:, np.newaxis], speeds[:, np.newaxis]]
            )  # (N, 5)
            f.write(point_data.tobytes())

    print(f"Written: {output_path} ({os.path.getsize(output_path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export ULM tracks to binary format")
    parser.add_argument("--input", required=True, help="Path to .pkl file")
    parser.add_argument("--output-dir", default="data/", help="Output directory")
    parser.add_argument(
        "--min-length", type=int, default=35, help="Minimum track length"
    )
    parser.add_argument(
        "--sigma",
        type=float,
        default=10.0,
        help="Gaussian smoothing sigma for velocity",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Use raw tracks instead of smoothed",
    )
    args = parser.parse_args()

    export_tracks(
        args.input,
        args.output_dir,
        args.min_length,
        use_smoothed=not args.raw,
        sigma=args.sigma,
    )
