import { NextResponse } from 'next/server'

// Google News RSS for MSE — avoids Cloudflare blocks on moneysavingexpert.com direct feed
const FEED_URL = 'https://news.google.com/rss/search?q=%22money+saving+expert%22+UK+finance&hl=en-GB&gl=GB&ceid=GB:en'

function extractTag(xml: string, tag: string): string {
  return (
    xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1] ??
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ??
    ''
  ).trim()
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return NextResponse.json({ error: 'Feed unavailable' }, { status: 502 })

    const xml = await res.text()
    const items: { title: string; link: string; description: string; pubDate: string }[] = []

    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const item = match[1]
      const title = stripHtml(extractTag(item, 'title'))
      const link = extractTag(item, 'link') || extractTag(item, 'guid')
      const description = stripHtml(extractTag(item, 'description')).slice(0, 220)
      const pubDate = extractTag(item, 'pubDate')
      if (title && link) items.push({ title, link, description, pubDate })
      if (items.length >= 12) break
    }

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: 'Failed to load tips' }, { status: 500 })
  }
}
