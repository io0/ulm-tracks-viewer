/**
 * Load and parse binary track data (tracks.bin).
 *
 * Format:
 *   Header (64 bytes): magic, version, nTracks, totalPoints, maxSpeed, boundsMin[3], boundsMax[3]
 *   Track Table (nTracks * 8 bytes): [pointOffset, length] per track
 *   Point Data (totalPoints * 20 bytes): [x, y, z, frameIndex, speed] per point as float32
 */

const MAGIC = 0x554c4d54; // "ULMT"

export async function loadTracks(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const headerView = new DataView(buffer, 0, 64);
  const magic = headerView.getUint32(0, true);
  if (magic !== MAGIC) throw new Error(`Bad magic: 0x${magic.toString(16)}`);

  const version = headerView.getUint32(4, true);
  if (version !== 2 && version !== 3) throw new Error(`Unsupported version: ${version} (expected 2 or 3)`);

  const nTracks = headerView.getUint32(8, true);
  const totalPoints = headerView.getUint32(12, true);
  const maxSpeed = headerView.getFloat32(16, true);

  const boundsMin = [
    headerView.getFloat32(20, true),
    headerView.getFloat32(24, true),
    headerView.getFloat32(28, true),
  ];
  const boundsMax = [
    headerView.getFloat32(32, true),
    headerView.getFloat32(36, true),
    headerView.getFloat32(40, true),
  ];

  // Track table starts at byte 64
  const tableOffset = 64;
  const tableView = new DataView(buffer, tableOffset, nTracks * 8);
  const tracks = new Array(nTracks);
  for (let i = 0; i < nTracks; i++) {
    tracks[i] = {
      pointOffset: tableView.getUint32(i * 8, true),
      length: tableView.getUint32(i * 8 + 4, true),
    };
  }

  // Point data starts after track table
  const floatsPerPoint = version === 3 ? 6 : 5;
  const pointDataOffset = tableOffset + nTracks * 8;
  const pointData = new Float32Array(buffer, pointDataOffset, totalPoints * floatsPerPoint);

  return { nTracks, totalPoints, maxSpeed, boundsMin, boundsMax, tracks, pointData, floatsPerPoint };
}
