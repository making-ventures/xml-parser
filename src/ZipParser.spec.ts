import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import ZipParser from "./ZipParser.js";

const createZipBuffer = (files: Array<{ name: string; content: string }>) => {
  const zip = new AdmZip();

  for (const file of files) {
    zip.addFile(file.name, Buffer.from(file.content));
  }

  return zip.toBuffer();
};

const createZipFile = async (
  files: Array<{ name: string; content: string }>,
) => {
  const buffer = createZipBuffer(files);
  const path = join(tmpdir(), `zip-parser-test-${Date.now()}.zip`);
  await writeFile(path, buffer);

  return path;
};

describe("ZipParser", () => {
  describe("getEntries", () => {
    it("should return entries with name and data buffer", () => {
      const zipBuffer = createZipBuffer([
        { name: "file.txt", content: "hello world" },
      ]);

      const entries = ZipParser.getEntries(zipBuffer);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe("file.txt");
      expect(entries[0]!.data.toString()).toBe("hello world");
    });

    it("should return multiple entries", () => {
      const zipBuffer = createZipBuffer([
        { name: "a.txt", content: "aaa" },
        { name: "b.txt", content: "bbb" },
        { name: "c.txt", content: "ccc" },
      ]);

      const entries = ZipParser.getEntries(zipBuffer);

      expect(entries).toHaveLength(3);
      expect(entries[0]!.name).toBe("a.txt");
      expect(entries[1]!.name).toBe("b.txt");
      expect(entries[2]!.name).toBe("c.txt");
    });

    it("should return basename for files in subdirectories", () => {
      const zipBuffer = createZipBuffer([
        { name: "sub/dir/deep.txt", content: "nested" },
      ]);

      const entries = ZipParser.getEntries(zipBuffer);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe("deep.txt");
      expect(entries[0]!.data.toString()).toBe("nested");
    });

    it("should return empty array for empty zip", () => {
      const zip = new AdmZip();
      const entries = ZipParser.getEntries(zip.toBuffer());

      expect(entries).toHaveLength(0);
    });

    it("should preserve binary content", () => {
      const binaryContent = Buffer.from([0x00, 0xff, 0x80, 0x7f]);
      const zip = new AdmZip();
      zip.addFile("binary.bin", binaryContent);

      const entries = ZipParser.getEntries(zip.toBuffer());

      expect(entries[0]!.data).toEqual(binaryContent);
    });
  });

  describe("createReadStreamsGetterFromEntries", () => {
    it("should yield entries with name and readable stream", async () => {
      const zipPath = await createZipFile([
        { name: "file.txt", content: "streamed content" },
      ]);

      const readStream = createReadStream(zipPath);
      const entries: Array<{ name: string; content: string }> = [];

      for await (const entry of ZipParser.createReadStreamsGetterFromEntries(
        readStream,
      )) {
        const chunks: Buffer[] = [];

        for await (const chunk of entry.stream) {
          chunks.push(chunk as Buffer);
        }

        entries.push({
          name: entry.name,
          content: Buffer.concat(chunks).toString(),
        });
      }

      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe("file.txt");
      expect(entries[0]!.content).toBe("streamed content");
    });

    it("should yield multiple entries in order", async () => {
      const zipPath = await createZipFile([
        { name: "first.txt", content: "1" },
        { name: "second.txt", content: "2" },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of ZipParser.createReadStreamsGetterFromEntries(
        readStream,
      )) {
        names.push(entry.name);
        entry.stream.autodrain();
      }

      expect(names).toHaveLength(2);
      expect(names[0]).toBe("first.txt");
      expect(names[1]).toBe("second.txt");
    });

    it("should return basename for files in subdirectories", async () => {
      const zipPath = await createZipFile([
        { name: "folder/nested.txt", content: "deep" },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of ZipParser.createReadStreamsGetterFromEntries(
        readStream,
      )) {
        names.push(entry.name);
        entry.stream.autodrain();
      }

      expect(names).toHaveLength(1);
      expect(names[0]).toBe("nested.txt");
    });
  });
});
