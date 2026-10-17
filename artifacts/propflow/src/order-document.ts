import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import { formatDate, formatMoney } from "./order-formatting";

const TABLE_WIDTH = 10350;
const FONT = "Arial";
const logoUrl = new URL("./assets/be-there-logo.jpg", import.meta.url).href;
const DEFAULT_PAN_NUMBER = "ABFFB5096B";

export interface OrderDocumentData {
  description?: string;
  companyName?: string;
  shootLocation?: string;
  vendorName?: string;
  vendorMobile?: string;
  receivingDate?: string;
  givingDate?: string;
  amount?: number;
  receivedAmount?: number;
  pendingAmount?: number;
  staff?: string;
  status?: string;
  paymentMethod?: string;
  challanNumber?: number;
}

interface ParagraphOptions {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bold?: boolean;
  color?: string;
  italic?: boolean;
  size?: number;
  underline?: boolean;
}

const cellBorder = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "333333",
};

const invoiceBorders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
  insideHorizontal: cellBorder,
  insideVertical: cellBorder,
};

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function paragraph(
  text: string,
  options: ParagraphOptions = {},
  after = 0
) {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: { before: 0, after, line: 210 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: options.size ?? 15,
        bold: options.bold,
        color: options.color ?? "222222",
        italics: options.italic,
        underline: options.underline ? {} : undefined,
      }),
    ],
  });
}

function invoiceCell(
  text: string | string[],
  width: number,
  options: ParagraphOptions & { fill?: string; margin?: number } = {}
) {
  const lines = Array.isArray(text) ? text : [text];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: {
      top: options.margin ?? 35,
      bottom: options.margin ?? 35,
      left: 55,
      right: 55,
    },
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill
      ? {
          type: ShadingType.CLEAR,
          fill: options.fill,
          color: options.fill,
        }
      : undefined,
    children: lines.map((line) =>
      paragraph(line, {
        alignment: options.alignment,
        bold: options.bold,
        color: options.color,
        italic: options.italic,
        size: options.size,
        underline: options.underline,
      })
    ),
  });
}

function detailRow(values: string[], widths: number[]) {
  return new TableRow({
    children: values.map((value, index) =>
      invoiceCell(value, widths[index], {
        bold: index % 2 === 0,
        size: index % 2 === 0 ? 12 : 14,
      })
    ),
  });
}

function safeText(value: string | undefined) {
  return value?.trim() || "-";
}

function safeDate(value: string | undefined) {
  return value?.trim() ? formatDate(value) : "-";
}

function numericValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeMoney(value: number | undefined) {
  const amount = numericValue(value);
  return amount === null ? "-" : formatMoney(amount);
}

function statusLabel(status: string | undefined) {
  if (status === "in_queue") return "Pending";
  if (status === "payment_left") return "Given";
  if (status === "paid") return "Paid";
  return "-";
}

function filePart(value: string | undefined) {
  const safeValue = (value?.trim() || "-")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_");
  return safeValue || "-";
}

async function loadLogo() {
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("The invoice logo could not be loaded.");
  return new Uint8Array(await response.arrayBuffer());
}

export function getOrderDocumentFilename(order: OrderDocumentData) {
  return `PropFlow_${filePart(order.companyName)}_${filePart(order.vendorName)}_${filePart(order.receivingDate)}.docx`;
}

export async function createOrderDocumentBlob(order: OrderDocumentData) {
  const companyName = safeText(order.companyName);
  const vendorName = safeText(order.vendorName);
  const receivingDate = safeText(order.receivingDate);
  const amount = numericValue(order.amount);
  const receivedAmount = numericValue(order.receivedAmount) ?? 0;
  const pendingAmount = amount === null ? null : amount - receivedAmount;
  const amountText = safeMoney(order.amount);
  const receivedText = safeMoney(order.receivedAmount);
  const pendingText =
    pendingAmount === null ? "-" : formatMoney(pendingAmount);
  const logo = await loadLogo();

  const header = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [1500, TABLE_WIDTH - 1500],
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 80 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: logo,
                    type: "jpg",
                    transformation: { width: 56, height: 56 },
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: TABLE_WIDTH - 1500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              paragraph(
                "INVOICE",
                {
                  alignment: AlignmentType.CENTER,
                  bold: true,
                  color: "B5232F",
                  size: 22,
                  underline: true,
                },
                30
              ),
              paragraph(
                "BE THERE ENTERPRISES",
                {
                  alignment: AlignmentType.CENTER,
                  bold: true,
                  color: "365C3D",
                  size: 18,
                },
                45
              ),
              paragraph(
                "SHOP ADDRESS:-GALA NO 19 MUKADAM ,COMPOUND NEAR SWAPNLOK,GOKULDAM MARKET, FILM CITY ROAD GOREGAON 400097",
                { alignment: AlignmentType.CENTER, size: 12 },
                20
              ),
              paragraph(`MOB. ${safeText(order.vendorMobile)}`, {
                alignment: AlignmentType.CENTER,
                size: 12,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const detailWidths = [1050, 2400, 1050, 2400, 1050, 2400];
  const details = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: detailWidths,
    borders: invoiceBorders,
    rows: [
      detailRow(
        [
          "Invoice No.",
          "-",
          "Challan No.",
          safeText(String(order.challanNumber ?? "")),
          "Ordered By.",
          safeText(order.staff),
        ],
        detailWidths
      ),
      detailRow(
        [
          "Date",
          safeDate(order.receivingDate),
          "Pickup Date.",
          safeDate(order.receivingDate),
          "PD Name.",
          vendorName,
        ],
        detailWidths
      ),
      detailRow(
        [
          "GSTIN No.",
          "-",
          "Drop Date.",
          safeDate(order.givingDate),
          "Project name",
          companyName,
        ],
        detailWidths
      ),
      detailRow(
        [
          "PAN No.",
          DEFAULT_PAN_NUMBER,
          "Contact no",
          safeText(order.vendorMobile),
          "Location",
          safeText(order.shootLocation),
        ],
        detailWidths
      ),
      detailRow(
        ["Company Name :", companyName, "", "", "", ""],
        detailWidths
      ),
      detailRow(
        ["GSTIN :", "-", "GSTIN :", "-", "State :", "-"],
        detailWidths
      ),
      detailRow(
        [
          "PAN No.",
          DEFAULT_PAN_NUMBER,
          "G.R. No.:",
          "-",
          "State Code",
          "-",
        ],
        detailWidths
      ),
    ],
  });

  const itemWidths = [700, 3200, 1050, 800, 1050, 1400, 2150];
  const itemHeader = [
    "S.No.",
    "DESCRIPTION OF GOODS",
    "HSN/SAC CODE",
    "DAY",
    "QUANTITY",
    "RATE",
    "Amount (Rs.)",
  ];
  const itemRows = [
    new TableRow({
      children: itemHeader.map((label, index) =>
        invoiceCell(label, itemWidths[index], {
          alignment: AlignmentType.CENTER,
          bold: true,
          size: 12,
          margin: 75,
        })
      ),
    }),
    new TableRow({
      children: [
        "1",
        safeText(order.description),
        "-",
        "-",
        "1",
        amountText,
        amountText,
      ].map((value, index) =>
        invoiceCell(value, itemWidths[index], {
          alignment: index === 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
          size: 13,
          margin: 80,
        })
      ),
    }),
    ...[2, 3, 4, 5, 6].map(
      (number) =>
        new TableRow({
          children: [
            String(number),
            "",
            "",
            "",
            "",
            "-",
            "-",
          ].map((value, index) =>
            invoiceCell(value, itemWidths[index], {
              alignment: index === 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
              size: 12,
              margin: 105,
            })
          ),
        })
    ),
  ];
  const items = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: itemWidths,
    borders: invoiceBorders,
    rows: itemRows,
  });

  const summaryWidths = [6150, TABLE_WIDTH - 6150];
  const summaryRows = [
    ["If there is a transfer to any account, it is your responsibility.", `Total     ${amountText}`],
    ["ACCO. NO. : -", `Grand Total     ${amountText}`],
    ["IFSC CODE: -", `Received Amount     ${receivedText}`],
    ["Bank: -", `Pending Amount     ${pendingText}`],
    ["BRANCH: -", `Status     ${statusLabel(order.status)}`],
    [`Payment Method: ${safeText(order.paymentMethod)}`, ""],
    [`Rupees : ${amountText}`, `Grand Total (Including Tax)     ${amountText}`],
  ];
  const summary = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: summaryWidths,
    borders: invoiceBorders,
    rows: summaryRows.map(
      ([left, right], index) =>
        new TableRow({
          children: [
            invoiceCell(left, summaryWidths[0], {
              bold: index === 0,
              fill: index === 0 ? "F47A2A" : undefined,
              size: 13,
            }),
            invoiceCell(right, summaryWidths[1], {
              alignment: AlignmentType.RIGHT,
              bold: index === 4 || index === 5,
              size: 13,
            }),
          ],
        })
    ),
  });

  const footerWidths = [6500, TABLE_WIDTH - 6500];
  const footer = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: footerWidths,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: footerWidths[0], type: WidthType.DXA },
            margins: { top: 80, bottom: 40, left: 0, right: 60 },
            children: [
              paragraph("Terms & Conditions :", { bold: true, size: 13 }, 35),
              paragraph("E.&.O.E.", { bold: true, size: 12 }, 25),
              paragraph(
                "1.Receiver Shall be hald responsible for any damage.",
                { size: 11 },
                15
              ),
              paragraph(
                "2.All disputes are subject to mumbai jurisdiction only",
                { size: 11 },
                15
              ),
              paragraph(
                "3. Rent will be charged for day if good Received after 12.00 noon",
                { size: 11 },
                15
              ),
              paragraph(
                "3. All disputes subject to Delhi Jurisdiction.",
                { size: 11 }
              ),
            ],
          }),
          new TableCell({
            width: { size: footerWidths[1], type: WidthType.DXA },
            margins: { top: 80, bottom: 40, left: 50, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              paragraph("For", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 14,
              }),
              paragraph("BE THERE ENTERPRISES", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 15,
              }),
              paragraph(" ", { alignment: AlignmentType.CENTER, size: 20 }),
              paragraph("Authorised Signatory", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 12,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 570, right: 780, bottom: 570, left: 780 },
          },
        },
        children: [
          header,
          paragraph(" ", {}, 40),
          details,
          items,
          summary,
          footer,
          paragraph(
            "Computer Generated Invoice",
            { alignment: AlignmentType.CENTER, size: 11 },
            0
          ),
        ],
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 13, color: "222222" },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
  });

  return Packer.toBlob(document);
}

export async function downloadOrderDocument(order: OrderDocumentData) {
  const blob = await createOrderDocumentBlob(order);
  saveAs(blob, getOrderDocumentFilename(order));
}
