# @mkven/xml-parser

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

Extends `XmlParser` with ZIP archive support. Extracts `.xml` files from ZIP and parses them.

```typescript
import { XmlZipParser } from "@mkven/xml-parser";

const parser = new XmlZipParser();

// Parse all XML files from a ZIP buffer (sync, via adm-zip)
const results = parser.parseFromZip(zipBuffer);
// [{ name: "data.xml", parsedData: { ROOT: { ROW: [...] } } }]

// Stream XML files from a ZIP ReadStream (async, via unzipper)
for await (const { name, stream } of parser.createParseReadStreamsGetterFromZip(readStream, "ticket")) {
  stream.on("data", async (rows) => { /* ... */ });
}
```

### `ZipParser`

Low-level static ZIP extraction utilities used internally by `XmlZipParser`.

- `ZipParser.getEntries(buffer)` — sync extraction via `adm-zip`
- `ZipParser.createReadStreamsGetterFromEntries(readStream)` — async streaming via `unzipper`

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

## Interfaces

- `IXmlParser` — interface for `XmlParser` (generic `parse<T>`, `createParseReadStream<T>`)
- `IXmlZipParser` — extends `IXmlParser` with `parseFromZip<T>` and `createParseReadStreamsGetterFromZip<T>`
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
