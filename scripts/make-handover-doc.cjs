const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, TableOfContents, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, Header, Footer, VerticalAlign,
} = require('docx');

// ─── Brand colors ────────────────────────────────────────────────────────────
const BRAND = '2563EB';        // primary blue
const BRAND_DARK = '1E3A8A';
const GREY = '64748B';
const LIGHT = 'EFF6FF';        // light blue row
const HEAD_FILL = '2563EB';

const CW = 9360; // content width (US Letter, 1" margins)

// ─── Helpers ─────────────────────────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, ...opts })],
  });
}
function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60 },
    children: typeof text === 'string'
      ? [new TextRun({ text, bold })]
      : text,
  });
}
function numbered(text) {
  return new Paragraph({
    numbering: { reference: 'steps', level: 0 },
    spacing: { after: 80 },
    children: typeof text === 'string' ? [new TextRun(text)] : text,
  });
}

function cell(content, { fill, bold, color, align, w } = {}) {
  const runs = Array.isArray(content) ? content : [new TextRun({ text: String(content), bold, color })];
  return new TableCell({
    borders,
    width: w ? { size: w, type: WidthType.DXA } : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: align || AlignmentType.LEFT, children: runs })],
  });
}

function table(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((hh, i) =>
      cell(hh, { fill: HEAD_FILL, bold: true, color: 'FFFFFF', w: widths[i] })),
  });
  const bodyRows = rows.map((r, ri) =>
    new TableRow({
      children: r.map((c, i) =>
        cell(c, { fill: ri % 2 ? LIGHT : undefined, w: widths[i] })),
    }));
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

function spacer(after = 160) {
  return new Paragraph({ spacing: { after }, children: [new TextRun('')] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 1 } },
    children: [new TextRun('')],
  });
}

// ─── Cover page ──────────────────────────────────────────────────────────────
const cover = [
  new Paragraph({ spacing: { before: 2400 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'MATERIAL FLOW ERP', bold: true, size: 56, color: BRAND })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'Construction Materials — Inventory, Sales & Import Management', size: 26, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: 'Business Owner Briefing & Operations Guide', bold: true, size: 30 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: 'A complete cloud-based system to run a construction-materials trading and warehousing business.', italics: true, size: 22, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Prepared for: Business Owners & Management', size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Prepared by: Yohannes Mulugeta', size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Date: June 2026  |  Version 1.0', size: 22, color: GREY })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── TOC ─────────────────────────────────────────────────────────────────────
const toc = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── 1. Executive Summary ────────────────────────────────────────────────────
const sec1 = [
  h1('1. Executive Summary'),
  p('Material Flow ERP is a complete, cloud-based business management system built specifically for a construction-materials trading and warehousing operation. It replaces scattered spreadsheets and manual records with a single, secure system that tracks every bag of cement, every steel bar, every sale, and every payment — from the moment goods arrive in a container to the moment they are sold to a contractor.'),
  p('The system is live on the internet, accessible from any computer or phone, and requires no installation. Staff simply open a web link and log in.'),
  spacer(80),
  h2('What problem it solves'),
  bullet('No more lost inventory — know exactly how much stock is in each warehouse at all times.'),
  bullet('No more guessing profit — every sale records its cost and profit automatically.'),
  bullet('No more credit confusion — track exactly what each customer owes and when they pay.'),
  bullet('No more import cost errors — landed cost (freight, customs, transport) is calculated per container.'),
  bullet('Full accountability — every action is logged with who did it and when.'),
  spacer(80),
  h2('The numbers it already manages (demo data)'),
  table(
    ['Area', 'What is tracked'],
    [
      ['Warehouses', '3 locations (Bole Main Store, Akaki Yard, Adama Branch)'],
      ['Products', '20 construction materials across 8 categories'],
      ['Suppliers', '7 suppliers (local cement, Chinese steel, Turkish tiles, UAE paint)'],
      ['Customers', '10 contractors and construction companies'],
      ['Sales', 'Live sales tracking with profit calculation'],
      ['Imports', 'Container tracking with full landed-cost breakdown'],
    ],
    [3000, 6360],
  ),
];

// ─── 2. What the system does ─────────────────────────────────────────────────
const sec2 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('2. What the System Does'),
  p('The system is organized into clear modules. Each one handles a part of the business.'),
  spacer(60),
  table(
    ['Module', 'What it does for the business'],
    [
      ['Dashboard', 'A live overview — today’s sales, money collected, profit, stock value, low-stock alerts, and pending approvals — all on one screen.'],
      ['Products', 'The full catalog of materials with pricing, units, stock levels, and reorder points. Prevents duplicate product codes.'],
      ['Inventory', 'Real-time stock per warehouse. Click any product to see its full history, value, and recent movements.'],
      ['Import Containers', 'Track shipments from suppliers with full cost breakdown (freight, customs, transport) and automatic landed-cost per unit.'],
      ['Sales', 'Create invoices, deduct stock automatically, and record cash or credit sales. Profit is hidden from sales staff.'],
      ['Customers', 'Customer accounts with credit limits, balances, and a full statement (ledger) of every sale and payment.'],
      ['Suppliers', 'Supplier records with a statement showing all containers imported and all payments made.'],
      ['Transfers', 'Move stock between warehouses with an approval step.'],
      ['Payments', 'Record money received from customers and paid to suppliers; updates account balances automatically.'],
      ['Approval Center', 'One screen where management approves transfers, returns, damages, adjustments, and payment changes.'],
      ['Reports', '17 ready-made reports (sales, inventory, profit, credit, imports) — exportable to Excel and PDF.'],
      ['Data Audit', 'Automatic consistency checks and the ability to compare app data against an old Excel file.'],
      ['User Management', 'Add staff, assign roles, and activate or deactivate accounts.'],
    ],
    [2400, 6960],
  ),
];

// ─── 3. Who uses it (roles) ──────────────────────────────────────────────────
const sec3 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('3. Staff Roles & Access'),
  p('Every staff member gets a role. The role controls what they can see and do. This protects sensitive information — for example, sales staff cannot see profit margins.'),
  spacer(60),
  table(
    ['Role', 'Who it is for', 'Can do'],
    [
      ['Super Admin', 'Owner / IT manager', 'Everything, including deleting records and managing users'],
      ['Manager', 'Operations manager', 'Run the whole business; approve requests; cannot delete master records'],
      ['Accountant', 'Finance staff', 'Payments, accounts, all reports, customer credit, view profit'],
      ['Warehouse Staff', 'Store keepers', 'Inventory, receive containers, create transfers and damage records'],
      ['Sales Staff', 'Sales team', 'Create sales and customers, record payments — profit is hidden'],
    ],
    [1900, 2600, 4860],
  ),
  spacer(120),
  new Paragraph({
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    border: borders,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: '  Tip: New staff who sign up start as "Unassigned" and cannot see any data until an admin assigns their role. This keeps the system secure by default.', italics: true, size: 21 })],
  }),
];

// ─── 4. Demonstration script ─────────────────────────────────────────────────
const sec4 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('4. How to Demonstrate It (Step-by-Step)'),
  p('Use this script when showing the system to a business owner. It takes about 10 minutes and tells a complete story.'),
  spacer(60),
  h2('Before the meeting'),
  numbered('Open the system link in a web browser and log in as Super Admin.'),
  numbered('Make sure the demo data is loaded (it already is — 20 products, sales, customers).'),
  numbered('Have it open on the Dashboard before the owner arrives.'),
  spacer(80),
  h2('The walk-through'),
  numbered([new TextRun({ text: 'Start at the Dashboard. ', bold: true }), new TextRun('"This is the first thing you see every morning — today’s sales, cash collected, profit, and total stock value. Notice the red alert: a product is below minimum stock."')]),
  numbered([new TextRun({ text: 'Click the notification bell (top right). ', bold: true }), new TextRun('"The system warns you automatically — low stock, pending approvals, customers over their credit limit."')]),
  numbered([new TextRun({ text: 'Open Inventory and click a product. ', bold: true }), new TextRun('"You can see exactly how much is in each warehouse, its value, and every recent movement."')]),
  numbered([new TextRun({ text: 'Open Sales and view an invoice. ', bold: true }), new TextRun('"Every sale automatically reduces stock and records the profit — your team never has to calculate it by hand."')]),
  numbered([new TextRun({ text: 'Open Import Containers. ', bold: true }), new TextRun('"When a shipment arrives, the system spreads freight, customs, and transport across the goods to give you the true landed cost per unit."')]),
  numbered([new TextRun({ text: 'Open Customers and click a customer. ', bold: true }), new TextRun('"This is their full account — everything they bought, everything they paid, and exactly what they still owe."')]),
  numbered([new TextRun({ text: 'Open Reports and export one to Excel. ', bold: true }), new TextRun('"Any report — sales, profit, inventory — exports to Excel or PDF in one click, with your branding."')]),
  numbered([new TextRun({ text: 'Open it on a phone. ', bold: true }), new TextRun('"It works on phones too, so warehouse staff can use it on the floor."')]),
  spacer(80),
  new Paragraph({
    shading: { fill: 'ECFDF5', type: ShadingType.CLEAR },
    border: { ...borders, left: { style: BorderStyle.SINGLE, size: 18, color: '10B981' } },
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: '  Closing line: "Everything you just saw is already running in the cloud. Your staff open a link, log in, and start working — no software to install, accessible from anywhere, and your data is backed up automatically."', italics: true, size: 21 })],
  }),
];

// ─── 5. Your action checklist ────────────────────────────────────────────────
const sec5 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('5. Your Action Checklist'),
  p('These are the things you should do to get the business fully running on the system.'),
  spacer(60),
  h2('Immediate (this week)'),
  table(
    ['#', 'Task', 'Why'],
    [
      ['1', 'Replace demo data with your real products', 'So stock, sales and reports reflect your actual business'],
      ['2', 'Add your real warehouses and their locations', 'Track stock by your actual stores'],
      ['3', 'Add your real suppliers and customers', 'Enable accurate credit and supplier statements'],
      ['4', 'Create accounts for your staff and assign roles', 'Give each person the right access'],
      ['5', 'Enter current stock levels (opening balances)', 'The starting point for all future tracking'],
    ],
    [600, 5160, 3600],
  ),
  spacer(120),
  h2('Soon (this month)'),
  table(
    ['#', 'Task', 'Why'],
    [
      ['6', 'Set credit limits for each customer', 'Get automatic over-limit warnings'],
      ['7', 'Set minimum stock levels per product', 'Get automatic low-stock alerts'],
      ['8', 'Decide who approves transfers, damages and payment edits', 'Set up your approval workflow'],
      ['9', 'Train staff on creating sales and recording payments', 'Daily operations run smoothly'],
      ['10', 'Run a test month and compare with your old records', 'Build confidence before going fully live'],
    ],
    [600, 5160, 3600],
  ),
  spacer(120),
  h2('Ongoing (good habits)'),
  bullet('Record every sale and payment in the system the day it happens.'),
  bullet('Review the Dashboard and notifications each morning.'),
  bullet('Approve pending requests in the Approval Center daily.'),
  bullet('Export monthly reports for your records and accountant.'),
  bullet('Do a physical stock count quarterly and use Stock Adjustments to correct.'),
];

// ─── 6. Decisions to make ────────────────────────────────────────────────────
const sec6 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('6. Decisions You Need to Make'),
  p('A few business decisions will shape how the system works for you. Discuss these with your management team.'),
  spacer(60),
  table(
    ['Decision', 'Options', 'Recommendation'],
    [
      ['Who is the system administrator?', 'Owner, or a trusted manager / IT person', 'One owner + one backup admin'],
      ['What roles do staff get?', 'Manager, Accountant, Warehouse, Sales', 'Match each person to their real job'],
      ['Who approves requests?', 'Owner only, or managers too', 'Managers approve daily; owner reviews'],
      ['Cash vs credit policy', 'Credit limits per customer', 'Set realistic limits to control risk'],
      ['Do you want Telegram alerts?', 'On or off', 'On — get instant alerts for big sales'],
      ['Branding on reports', 'Company name and logo', 'Add your company name and logo'],
    ],
    [3000, 3360, 3000],
  ),
];

// ─── 7. Costs & what is included ─────────────────────────────────────────────
const sec7 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('7. What It Costs to Run'),
  p('The system runs on professional cloud services. It can start completely free and only costs money as the business grows.'),
  spacer(60),
  table(
    ['Service', 'What it provides', 'Starting cost'],
    [
      ['Hosting (Vercel)', 'Runs the website, always online, fast', 'Free to start'],
      ['Database (Supabase)', 'Stores all your data securely, with backups', 'Free up to 500 MB'],
      ['Domain name (optional)', 'Your own web address (e.g. yourcompany.com)', '~$12 / year'],
      ['Telegram alerts (optional)', 'Instant notifications', 'Free'],
    ],
    [2600, 4360, 2400],
  ),
  spacer(120),
  new Paragraph({
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    border: borders,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: '  As the business grows (more than ~100 daily users or large data), the database upgrades to a paid plan of roughly $25/month. For most growing businesses, the free tier is enough for the first year.', italics: true, size: 21 })],
  }),
];

// ─── 8. Security & safety ────────────────────────────────────────────────────
const sec8 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('8. Security & Data Safety'),
  bullet([new TextRun({ text: 'Secure login. ', bold: true }), new TextRun('Every user has their own password-protected account.')]),
  bullet([new TextRun({ text: 'Role-based access. ', bold: true }), new TextRun('Staff only see what their role allows. Sales staff never see profit margins.')]),
  bullet([new TextRun({ text: 'Nothing is truly deleted. ', bold: true }), new TextRun('Records are archived, not erased — you keep a full history.')]),
  bullet([new TextRun({ text: 'Approval workflow. ', bold: true }), new TextRun('Sensitive changes (deleting payments, stock adjustments) need management approval.')]),
  bullet([new TextRun({ text: 'Full audit trail. ', bold: true }), new TextRun('Every action records who did it and when.')]),
  bullet([new TextRun({ text: 'Automatic backups. ', bold: true }), new TextRun('The cloud database backs up your data automatically.')]),
  bullet([new TextRun({ text: 'Document vault. ', bold: true }), new TextRun('Attach contracts, invoices, and payment slips securely to any record.')]),
];

// ─── 9. Support & contacts ───────────────────────────────────────────────────
const sec9 = [
  new Paragraph({ children: [new PageBreak()] }),
  h1('9. Quick Reference'),
  h2('Where everything lives'),
  table(
    ['Item', 'Location'],
    [
      ['Live application', 'https://material-flow-erp.vercel.app'],
      ['Database & backups', 'Supabase dashboard (admin access)'],
      ['Source code', 'GitHub repository (private)'],
      ['How-to & operations', 'docs/RUNBOOK.md (in the project)'],
    ],
    [3000, 6360],
  ),
  spacer(120),
  h2('Common questions'),
  p('Q: Do staff need to install anything?', { bold: true }),
  p('A: No. They open a web link and log in. It works on any computer or phone.'),
  p('Q: What if a staff member leaves?', { bold: true }),
  p('A: An admin deactivates their account in User Management — instantly.'),
  p('Q: Can we use it without internet?', { bold: true }),
  p('A: It is an online system. A reliable internet connection is recommended for each location.'),
  p('Q: Is our data safe if a computer breaks?', { bold: true }),
  p('A: Yes. All data lives in the secure cloud database, not on any single computer.'),
  spacer(200),
  divider(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Material Flow ERP — built to run a construction-materials business with clarity and control.', italics: true, color: GREY, size: 20 })],
  }),
];

// ─── Build document ──────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Yohannes Mulugeta',
  title: 'Material Flow ERP — Business Owner Briefing',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: '1E293B' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: BRAND_DARK },
        paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: BRAND },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 280 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 320 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 6 } },
          children: [
            new TextRun({ text: 'Material Flow ERP  |  Business Owner Briefing  |  Page ', size: 18, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GREY }),
          ],
        })],
      }),
    },
    children: [
      ...cover,
      ...toc,
      ...sec1,
      ...sec2,
      ...sec3,
      ...sec4,
      ...sec5,
      ...sec6,
      ...sec7,
      ...sec8,
      ...sec9,
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('D:/material-flow-erp/docs/Material-Flow-ERP-Business-Briefing.docx', buf);
  console.log('✅ Document created: docs/Material-Flow-ERP-Business-Briefing.docx');
});
