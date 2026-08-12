'use client'

import { useFormFields } from '@payloadcms/ui'

/**
 * Shows the printable code on the QR Codes edit screen, with download links.
 *
 * Staff produce artwork on print deadlines. Without this, getting a code into a
 * layout means asking an engineer, and that request arrives at the worst
 * possible moment every time.
 */
export function QrPreview() {
  const code = useFormFields(([fields]) => fields?.code?.value as string | undefined)

  if (!code) {
    return (
      <div style={wrap}>
        <p style={hint}>Save this code first, then its printable image appears here.</p>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {/* PNG purely because it displays at a predictable pixel size in the panel.
          The SVG below is the one that should reach a layout. */}
      <img
        src={`/qr/${code}?format=png&size=320`}
        alt={`QR code ${code}`}
        width={160}
        height={160}
        style={{ display: 'block', border: '1px solid #ddd', borderRadius: 4, background: '#fff' }}
      />
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>
          Scanning this opens <code>/g/{code}</code>, which redirects to whatever this code
          currently points at. Re-point it any time. The code itself never changes.
        </p>
        <p style={{ margin: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href={`/qr/${code}?download=1`} style={link}>
            Download SVG for print
          </a>
          <a href={`/qr/${code}?format=png&size=2048&download=1`} style={link}>
            Download PNG
          </a>
        </p>
        <p style={hint}>
          Use the SVG for anything printed. Keep the white border around the code: cropping it is
          the most common reason a printed code stops scanning.
        </p>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex',
  gap: 20,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  marginBottom: 24,
}

const link: React.CSSProperties = {
  fontSize: 13,
  textDecoration: 'underline',
}

const hint: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 12,
  opacity: 0.7,
  maxWidth: '48ch',
}

export default QrPreview
