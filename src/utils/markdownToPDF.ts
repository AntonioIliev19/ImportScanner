import MarkdownIt from "markdown-it";
import fs from "node:fs/promises";
import puppeteer from "puppeteer";
import path from "node:path";

export async function markdownToPDF(markdown: string, outputPath: string) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  const html = md.render(markdown);

  const cssPath = require.resolve("github-markdown-css/github-markdown.css");
  const css = await fs.readFile(cssPath, "utf8");

  const pageHtml = `
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
            ${css}
            @page { margin: 20mm 16mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .markdown-body { box-sizing: border-box; }
            pre, blockquote { page-break-inside: avoid; }
            h1, h2, h3 { page-break-after: avoid; }
            </style>
        </head>
        <body>
            <article class="markdown-body">${html}</article>
        </body>
    </html>
    `;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(pageHtml, { waitUntil: "load" });
  await page.emulateMediaType("screen");

  await page.pdf({
    path: path.resolve(outputPath),
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", right: "16mm", bottom: "20mm", left: "16mm" },
  });

  await browser.close();
}
