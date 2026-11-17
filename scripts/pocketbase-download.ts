import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

// node scripts/pocketbase-download.ts <version> <destination>
// Downloads the PocketBase release for this machine and extracts the single
// `pocketbase` binary. The zip is read by hand so nothing but Node is needed
// (the CI container has no unzip).
const [version, destination] = process.argv.slice(2);
if (!version || !destination) {
  console.error("usage: pocketbase-download.ts <version> <destination>");
  process.exit(1);
}

const os = { darwin: "darwin", linux: "linux" }[process.platform as string];
const arch = { x64: "amd64", arm64: "arm64" }[process.arch as string];
if (!os || !arch) {
  console.error(`Unsupported platform ${process.platform}/${process.arch}.`);
  process.exit(1);
}

const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${os}_${arch}.zip`;
console.log(`Downloading PocketBase v${version} (${os}/${arch})…`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Download failed (${response.status}): ${url}`);
  process.exit(1);
}
const zip = Buffer.from(await response.arrayBuffer());

/** Finds one file in a zip via its central directory and inflates it. */
function extract(name: string): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip file");
  const entries = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeader = zip.readUInt32LE(offset + 42);
    const entryName = zip.toString(
      "utf8",
      offset + 46,
      offset + 46 + nameLength,
    );
    if (entryName === name) {
      const start =
        localHeader +
        30 +
        zip.readUInt16LE(localHeader + 26) +
        zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(start, start + compressedSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} not found in the archive`);
}

mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, extract("pocketbase"));
chmodSync(destination, 0o755);
