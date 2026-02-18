# @mkven/xml-parser

[![npm](https://img.shields.io/npm/v/@mkven/xml-parser)](https://www.npmjs.com/package/@mkven/xml-parser)

Opinionated XML parsing utilities built on top of [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser). Designed for processing XML data feeds — both as raw buffers and from ZIP archives.

## Installation

```bash
pnpm add @mkven/xml-parser
```

## Classes

### `XmlParser`

Parses XML buffers and readable streams with the following conventions:

- **Tag names** are uppercased (`<ticket>` → `TICKET`)
- **Attributes** are prefixed with `$` (`id="1"` → `$id: "1"`)
- **All values are strings** — numbers are never parsed (`"007"` stays `"007"`)
- **`"null"` attribute values** are converted to empty string
- **Whitespace** in attribute values is normalized (tabs, newlines, `&nbsp;`, invisible Unicode → collapsed/trimmed)
- **Malformed XML** with `><<` and `>&<` patterns is auto-escaped before parsing

#### `parse<T>(data: Buffer, validationOptions?): T`

Parses an XML buffer and returns the parsed object.

#### `createParseReadStream<T>(stream: Readable, rowTag: string, validationOptions?): ParseReadStream<T>`

Wraps a readable stream into a chunked parser that emits arrays of parsed rows matching `rowTag`. Each `"data"` event receives `T[] | null` (`null` when a chunk has no matching tags).

```typescript
import { XmlParser } from "@mkven/xml-parser";

const parser = new XmlParser();

// Parse a buffer
const result = parser.parse(buffer);
// { ROOT: { ROW: [{ $id: "1" }, { $id: "2" }] } }

// Stream-parse by tag name
const stream = parser.createParseReadStream(readableStream, "ticket");
stream.on("data", async (rows: Record<string, string>[] | null) => {
  // rows is always an array (or null if chunk had no matching tags)
});
```

### `XmlZipParser`

Extends `XmlParser` with ZIP archive support. Only `.xml` files inside the archive are processed; other entries are skipped.

#### `parseFromZip(data: Buffer, validationOptions?): Array<{ name, parsedData }>`

Synchronous. Extracts all XML files from a ZIP buffer via `adm-zip` and parses each one.

#### `static createReadStreamsGetterFromZip(data: ReadStream): AsyncGenerator<{ name, stream }>`

Static async generator. Streams ZIP entries via `unzipper`, yielding raw readable streams for each `.xml` entry. Non-XML entries are autodrained. Useful when you need the raw XML stream without parsing.

#### `createParseReadStreamsGetterFromZip<T>(data: ReadStream, rowTag: string, validationOptions?): AsyncGenerator<{ name, stream: ParseReadStream<T> }>`

Instance async generator. Combines the static streaming method above with `createParseReadStream`, yielding a `ParseReadStream<T>` per XML entry.

```typescript
import { XmlZipParser } from "@mkven/xml-parser";

const parser = new XmlZipParser();

// Parse all XML files from a ZIP buffer (sync, via adm-zip)
const results = parser.parseFromZip(zipBuffer);
// [{ name: "data.xml", parsedData: { ROOT: { ROW: [...] } } }]

// Stream raw XML entries from a ZIP (static, no parsing)
for await (const { name, stream } of XmlZipParser.createReadStreamsGetterFromZip(readStream)) {
  // stream is a raw Readable for each .xml file
}

// Stream and parse XML entries from a ZIP
for await (const { name, stream } of parser.createParseReadStreamsGetterFromZip(readStream, "ticket")) {
  stream.on("data", async (rows) => { /* ... */ });
}
```

### `ZipParser`

Low-level static utilities for ZIP extraction. Used internally by `XmlZipParser`, but exported for direct use.

#### `static getEntries(data: Buffer): Array<{ name: string, data: Buffer }>`

Synchronous extraction via `adm-zip`. Returns all entries with their names and data buffers.

#### `static createReadStreamsGetterFromEntries(data: ReadStream): AsyncGenerator<{ name: string, stream: Entry }>`

Async generator via `unzipper`. Streams ZIP entries one by one. Directory prefixes are stripped from entry names via `basename`.

## Options

### `alwaysArray`

By default, `fast-xml-parser` returns a single child element as an object and multiple children as an array. Pass `{ alwaysArray: true }` to always wrap child elements in arrays (root element and attributes are not affected):

```typescript
// Default behavior
const parser = new XmlParser();
parser.parse(xml);
// Single child:      { ROOT: { ROW: { $id: "1" } } }          — object
// Multiple children: { ROOT: { ROW: [{ $id: "1" }, ...] } }   — array

// With alwaysArray
const parser = new XmlParser({ alwaysArray: true });
parser.parse(xml);
// Single child:      { ROOT: { ROW: [{ $id: "1" }] } }        — always array
// Multiple children: { ROOT: { ROW: [{ $id: "1" }, ...] } }   — array
```

### `validationOptions`

All parsing methods accept an optional `validationOptions` parameter (`ValidationOptions | boolean` from `fast-xml-parser`). Pass `true` to enable validation, or a `ValidationOptions` object for fine-grained control.

## Interfaces

- `IXmlParser` — interface for `XmlParser` (generic `parse<T>`, `createParseReadStream<T>`)
- `IXmlZipParser` — extends `IXmlParser` with `parseFromZip<T>`, `createParseReadStreamsGetterFromZip<T>`
- `ParseReadStream<T>` — stream-like object with typed `on("data", listener)` method

## Dependencies

- [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser) — XML parsing engine
- [adm-zip](https://www.npmjs.com/package/adm-zip) — synchronous ZIP extraction
- [unzipper](https://www.npmjs.com/package/unzipper) — streaming ZIP extraction

## Development

```bash
sh check.sh       # lint (biome) + typecheck (tsc) + tests (vitest)
sh health.sh      # gitleaks + outdated deps + audit
sh all-checks.sh  # both
```

### Releasing

Uses [release-it](https://github.com/release-it/release-it) with conventional changelog:

```bash
pnpm run release:dry  # preview
pnpm run release      # bump version, update CHANGELOG.md, tag, publish to npm
```

## License

MIT
