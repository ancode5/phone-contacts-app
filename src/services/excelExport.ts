import type { Contact, Group, Organization } from '../types';

interface ZipSourceFile {
  name: string;
  content: string;
}

interface PreparedZipFile {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc32: number;
  offset: number;
}

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const HEADER_TITLES = [
  'ФИО',
  'Рабочий телефон',
  'Личный телефон',
  'Рабочий email',
  'Личный email',
  'Место работы',
  'Структурное подразделение',
  'Должность',
  'Группы',
  'Заметки',
  'Избранное',
  'Дата создания',
  'Дата изменения',
] as const;

const COLUMN_WIDTHS = [32, 20, 20, 30, 30, 38, 30, 30, 30, 50, 12, 21, 21] as const;

function sanitizeXmlText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function columnName(index: number): string {
  let current = index + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function inlineStringCell(reference: string, value: string, style: number): string {
  const preserveSpace = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t${preserveSpace}>${escapeXml(value)}</t></is></c>`;
}

function buildWorksheet(rows: string[][]): string {
  const columns = COLUMN_WIDTHS.map(
    (width, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join('');

  const sheetRows = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      const style = rowIndex === 0 ? 1 : 2;
      const height = rowIndex === 0 ? ' ht="30" customHeight="1"' : '';
      const cells = row
        .map((value, columnIndex) =>
          inlineStringCell(`${columnName(columnIndex)}${excelRow}`, value, style),
        )
        .join('');

      return `<row r="${excelRow}"${height}>${cells}</row>`;
    })
    .join('');

  const lastColumn = columnName(HEADER_TITLES.length - 1);
  const lastRow = Math.max(rows.length, 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function buildStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF278B57"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E5DE"/></left>
      <right style="thin"><color rgb="FFD9E5DE"/></right>
      <top style="thin"><color rgb="FFD9E5DE"/></top>
      <bottom style="thin"><color rgb="FFD9E5DE"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function writeUint32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function copyBytes(target: Uint8Array, offset: number, source: Uint8Array): number {
  target.set(source, offset);
  return offset + source.length;
}

function createZip(files: ZipSourceFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const prepared: PreparedZipFile[] = [];
  let localSize = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    prepared.push({
      nameBytes,
      data,
      crc32: crc32(data),
      offset: localSize,
    });
    localSize += 30 + nameBytes.length + data.length;
  }

  const centralSize = prepared.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const archive = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(archive.buffer);
  let offset = 0;

  for (const file of prepared) {
    offset = writeUint32(view, offset, 0x04034b50);
    offset = writeUint16(view, offset, 20);
    offset = writeUint16(view, offset, 0x0800);
    offset = writeUint16(view, offset, 0);
    offset = writeUint16(view, offset, now.time);
    offset = writeUint16(view, offset, now.date);
    offset = writeUint32(view, offset, file.crc32);
    offset = writeUint32(view, offset, file.data.length);
    offset = writeUint32(view, offset, file.data.length);
    offset = writeUint16(view, offset, file.nameBytes.length);
    offset = writeUint16(view, offset, 0);
    offset = copyBytes(archive, offset, file.nameBytes);
    offset = copyBytes(archive, offset, file.data);
  }

  const centralDirectoryOffset = offset;

  for (const file of prepared) {
    offset = writeUint32(view, offset, 0x02014b50);
    offset = writeUint16(view, offset, 20);
    offset = writeUint16(view, offset, 20);
    offset = writeUint16(view, offset, 0x0800);
    offset = writeUint16(view, offset, 0);
    offset = writeUint16(view, offset, now.time);
    offset = writeUint16(view, offset, now.date);
    offset = writeUint32(view, offset, file.crc32);
    offset = writeUint32(view, offset, file.data.length);
    offset = writeUint32(view, offset, file.data.length);
    offset = writeUint16(view, offset, file.nameBytes.length);
    offset = writeUint16(view, offset, 0);
    offset = writeUint16(view, offset, 0);
    offset = writeUint16(view, offset, 0);
    offset = writeUint16(view, offset, 0);
    offset = writeUint32(view, offset, 0);
    offset = writeUint32(view, offset, file.offset);
    offset = copyBytes(archive, offset, file.nameBytes);
  }

  offset = writeUint32(view, offset, 0x06054b50);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, prepared.length);
  offset = writeUint16(view, offset, prepared.length);
  offset = writeUint32(view, offset, centralSize);
  offset = writeUint32(view, offset, centralDirectoryOffset);
  writeUint16(view, offset, 0);

  return archive;
}

function buildWorkbookFiles(rows: string[][]): ZipSourceFile[] {
  const createdAt = new Date().toISOString();

  return [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Справочник контактов</dc:creator>
  <cp:lastModifiedBy>Справочник контактов</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Справочник контактов</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Листы</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Контакты</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="Контакты" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029"/>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', content: buildStyles() },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheet(rows) },
  ];
}

export function buildContactsWorkbook(
  contacts: Contact[],
  organizations: Organization[],
  groups: Group[],
): Uint8Array {
  const organizationsById = new Map(organizations.map((item) => [item.id, item.name]));
  const groupsById = new Map(groups.map((item) => [item.id, item.name]));

  const contactRows = contacts
    .filter((contact) => contact.deletedAt === null)
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' }),
    )
    .map((contact) => [
      contact.fullName,
      contact.workPhone,
      contact.personalPhone,
      contact.workEmail,
      contact.personalEmail,
      organizationsById.get(contact.organizationId) ?? '',
      contact.department,
      contact.position,
      contact.groupIds
        .map((id) => groupsById.get(id))
        .filter((name): name is string => Boolean(name))
        .join(', '),
      contact.notes,
      contact.isFavorite ? 'Да' : 'Нет',
      formatDate(contact.createdAt),
      formatDate(contact.updatedAt),
    ]);

  return createZip(buildWorkbookFiles([[...HEADER_TITLES], ...contactRows]));
}

export function exportContactsToExcel(
  contacts: Contact[],
  organizations: Organization[],
  groups: Group[],
): void {
  const workbook = buildContactsWorkbook(contacts, organizations, groups);
  const workbookBytes = new Uint8Array(workbook.byteLength);
  workbookBytes.set(workbook);
  const blob = new Blob([workbookBytes.buffer], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `contacts_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
