import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {return {rules:[{userAgent:'*',allow:'/',disallow:['/api/','/feedback/attachments/']}],sitemap:'https://feedback.humanquest.net/sitemap.xml'};}
