import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const templateId = process.env.NOTION_CUSTOMER_TEMPLATE_ID;

    if (!templateId) {
      return res.status(500).json({
        error: "Missing NOTION_CUSTOMER_TEMPLATE_ID",
      });
    }

    const duplicated = await notion.pages.create({
      parent: { type: "page_id", page_id: templateId },
      properties: {},
    });

    // @ts-ignore: Notion SDK types outdated, url exists runtime [TS2322]
    return res.status(200).json({
      success: true,
      newPageId: duplicated.id,
      url: duplicated.url,
    });
  } catch (error: any) {
    console.error("Error duplicating customer OS:", error);
    return res.status(500).json({
      error: error.message || "Unknown error",
    });
  }
}