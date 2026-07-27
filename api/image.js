export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text') || 'سلام';

  const svg = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#bg)" rx="20"/>
      <rect x="20" y="20" width="760" height="360" fill="none" 
            stroke="#4a9eff" stroke-width="2" rx="15" opacity="0.5"/>
      <text x="400" y="220" 
            font-family="'Scheherazade New', 'Noto Naskh Arabic', Arial" 
            font-size="60" 
            fill="#ffffff" 
            text-anchor="middle" 
            dominant-baseline="middle"
            direction="rtl">
        ${text}
      </text>
      <text x="400" y="350" 
            font-family="Arial" 
            font-size="20" 
            fill="#4a9eff" 
            text-anchor="middle" 
            opacity="0.7">
        ✦ ✦ ✦
      </text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}
