import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it } from "vitest";
import XmlZipParser from "./XmlZipParser.js";

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
  const path = join(tmpdir(), `xml-zip-parser-test-${Date.now()}.zip`);
  await writeFile(path, buffer);

  return path;
};

describe("XmlZipParser", () => {
  let parser: XmlZipParser;

  beforeEach(() => {
    parser = new XmlZipParser();
  });

  describe("parseFromZip", () => {
    it("should parse XML files from a zip buffer", () => {
      const zipBuffer = createZipBuffer([
        {
          name: "data.xml",
          content: '<root><row id="1"/><row id="2"/></root>',
        },
      ]);

      const result = parser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("data.xml");
      expect(result[0]!.parsedData.ROOT.ROW).toHaveLength(2);
      expect(result[0]!.parsedData.ROOT.ROW[0].$id).toBe("1");
    });

    it("should parse multiple XML files from zip", () => {
      const zipBuffer = createZipBuffer([
        { name: "a.xml", content: '<data><item val="A"/></data>' },
        { name: "b.xml", content: '<data><item val="B"/></data>' },
      ]);

      const result = parser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(2);
      expect(result[0]!.parsedData.DATA.ITEM.$val).toBe("A");
      expect(result[1]!.parsedData.DATA.ITEM.$val).toBe("B");
    });

    it("should skip non-XML files in zip", () => {
      const zipBuffer = createZipBuffer([
        { name: "data.xml", content: '<data><item val="keep"/></data>' },
        { name: "readme.txt", content: "ignore me" },
        { name: "photo.jpg", content: "binary stuff" },
      ]);

      const result = parser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("data.xml");
    });

    it("should handle XML files in subdirectories", () => {
      const zipBuffer = createZipBuffer([
        {
          name: "subdir/nested.xml",
          content: '<data><item val="deep"/></data>',
        },
      ]);

      const result = parser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("nested.xml");
      expect(result[0]!.parsedData.DATA.ITEM.$val).toBe("deep");
    });

    it("should return empty array for zip with no XML files", () => {
      const zipBuffer = createZipBuffer([
        { name: "data.json", content: '{"key": "value"}' },
      ]);

      const result = parser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(0);
    });
  });

  describe("parseFromZip with alwaysArray", () => {
    let arrayParser: XmlZipParser;

    beforeEach(() => {
      arrayParser = new XmlZipParser({ alwaysArray: true });
    });

    it("should wrap single child element in array", () => {
      const zipBuffer = createZipBuffer([
        { name: "data.xml", content: '<root><row id="only"/></root>' },
      ]);

      const result = arrayParser.parseFromZip(zipBuffer);

      expect(result).toHaveLength(1);
      expect(Array.isArray(result[0]!.parsedData.ROOT.ROW)).toBe(true);
      expect(result[0]!.parsedData.ROOT.ROW).toHaveLength(1);
      expect(result[0]!.parsedData.ROOT.ROW[0].$id).toBe("only");
    });

    it("should keep multiple elements as array", () => {
      const zipBuffer = createZipBuffer([
        {
          name: "data.xml",
          content: '<root><row id="1"/><row id="2"/></root>',
        },
      ]);

      const result = arrayParser.parseFromZip(zipBuffer);

      expect(Array.isArray(result[0]!.parsedData.ROOT.ROW)).toBe(true);
      expect(result[0]!.parsedData.ROOT.ROW).toHaveLength(2);
    });
  });

  describe("createReadStreamsGetterFromZip", () => {
    it("should yield only XML entries as streams", async () => {
      const zipPath = await createZipFile([
        { name: "data.xml", content: '<root><row id="1"/></root>' },
        { name: "readme.txt", content: "ignore me" },
        { name: "other.xml", content: '<root><row id="2"/></root>' },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of XmlZipParser.createReadStreamsGetterFromZip(
        readStream,
      )) {
        names.push(entry.name);
        entry.stream.autodrain();
      }

      expect(names).toEqual(["data.xml", "other.xml"]);
    });

    it("should yield nothing for zip with no XML files", async () => {
      const zipPath = await createZipFile([
        { name: "data.json", content: '{"a":1}' },
        { name: "notes.txt", content: "hello" },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of XmlZipParser.createReadStreamsGetterFromZip(
        readStream,
      )) {
        names.push(entry.name);
        entry.stream.autodrain();
      }

      expect(names).toHaveLength(0);
    });

    it("should return basename for XML files in subdirectories", async () => {
      const zipPath = await createZipFile([
        { name: "sub/dir/nested.xml", content: "<root/>" },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of XmlZipParser.createReadStreamsGetterFromZip(
        readStream,
      )) {
        names.push(entry.name);
        entry.stream.autodrain();
      }

      expect(names).toEqual(["nested.xml"]);
    });
  });

  describe("createParseReadStreamsGetterFromZip", () => {
    it("should yield parsed XML streams from zip", async () => {
      const zipPath = await createZipFile([
        {
          name: "data.xml",
          content:
            '<data><item id="1" name="a"/><item id="2" name="b"/></data>',
        },
      ]);

      const readStream = createReadStream(zipPath);
      const results: Array<{
        name: string;
        rows: Record<string, string>[];
      }> = [];

      for await (const entry of parser.createParseReadStreamsGetterFromZip(
        readStream,
        "item",
      )) {
        const rows: Record<string, string>[] = [];

        await new Promise<void>((resolve) => {
          entry.stream.on("data", (data: Record<string, string>[] | null) => {
            if (data) {
              rows.push(...data);
            }

            return Promise.resolve();
          });

          setTimeout(resolve, 100);
        });

        results.push({ name: entry.name, rows });
      }

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("data.xml");
      expect(results[0]!.rows).toHaveLength(2);
      expect(results[0]!.rows[0]!.$id).toBe("1");
      expect(results[0]!.rows[1]!.$name).toBe("b");
    });

    it("should skip non-XML files and parse only XML", async () => {
      const zipPath = await createZipFile([
        { name: "skip.txt", content: "not xml" },
        {
          name: "keep.xml",
          content: '<data><item id="yes"/></data>',
        },
      ]);

      const readStream = createReadStream(zipPath);
      const names: string[] = [];

      for await (const entry of parser.createParseReadStreamsGetterFromZip(
        readStream,
        "item",
      )) {
        names.push(entry.name);

        await new Promise<void>((resolve) => {
          entry.stream.on("data", () => Promise.resolve());
          setTimeout(resolve, 100);
        });
      }

      expect(names).toEqual(["keep.xml"]);
    });

    it("should handle multiple XML files in zip", async () => {
      const zipPath = await createZipFile([
        { name: "a.xml", content: '<data><row val="A"/></data>' },
        { name: "b.xml", content: '<data><row val="B"/></data>' },
      ]);

      const readStream = createReadStream(zipPath);
      const results: Array<{
        name: string;
        rows: Record<string, string>[];
      }> = [];

      for await (const entry of parser.createParseReadStreamsGetterFromZip(
        readStream,
        "row",
      )) {
        const rows: Record<string, string>[] = [];

        await new Promise<void>((resolve) => {
          entry.stream.on("data", (data: Record<string, string>[] | null) => {
            if (data) {
              rows.push(...data);
            }

            return Promise.resolve();
          });

          setTimeout(resolve, 100);
        });

        results.push({ name: entry.name, rows });
      }

      expect(results).toHaveLength(2);
      expect(results[0]!.rows[0]!.$val).toBe("A");
      expect(results[1]!.rows[0]!.$val).toBe("B");
    });
  });
});
