import type { ReactNode } from 'react'
import './covers.css'

type CoverProps = { id: string; title: string; author: string; className?: string }

const themes: Record<string, { paper: string; ink: string; eyebrow: string }> = {
  b1: { paper: '#143d3d', ink: '#e3cb95', eyebrow: 'INVISIBLE CITIES' },
  b2: { paper: '#e7d880', ink: '#284a3b', eyebrow: 'SIDDHARTHA' },
  b3: { paper: '#f0ede4', ink: '#282a27', eyebrow: 'DESIGNING DESIGN' },
  b4: { paper: '#272c53', ink: '#f1d1ac', eyebrow: 'LETTERS FROM THE EDGE' },
  b5: { paper: '#b7abbc', ink: '#353144', eyebrow: 'MAYBE YOU SHOULD TALK TO SOMEONE' },
  b6: { paper: '#eeeadf', ink: '#ae4334', eyebrow: 'INSIDE THE SYSTEM' },
  b7: { paper: '#172b3d', ink: '#edf0df', eyebrow: 'A BRIEF HISTORY OF TIME' },
  b8: { paper: '#f0e6d2', ink: '#bf503d', eyebrow: 'THE STRANGER' },
}

function Cities() {
  return <g>
    <path fill="#b59766" d="M29 240h33v99H29zM47 204h15v135H47zM71 265h37v74H71zM176 207h36v132h-36zM189 179h10v28h-10zM223 246h45v93h-45z" />
    <path fill="#e3cb95" d="M102 245h56v95h-56zM109 227h42v18h-42zM116 214h28v13h-28zM124 199h12v15h-12zM18 298h264v17H18z" />
    <path fill="#143d3d" d="M43 251h8v17h-8zM183 223h8v19h-8zM197 223h8v19h-8zM233 259h8v18h-8zM251 259h8v18h-8zM117 257h26v40h-26zM40 340v-10a19 19 0 0 1 38 0v10zM100 340v-10a19 19 0 0 1 38 0v10zM160 340v-10a19 19 0 0 1 38 0v10zM220 340v-10a19 19 0 0 1 38 0v10z" />
    <path fill="none" stroke="#73958b" strokeWidth="1.1" d="M25 356h250M43 367h197M73 378h185M158 192v-36m-13 20 13-20 13 20M20 288h260" />
    <path fill="none" stroke="#e3cb95" strokeWidth="1" d="M66 240h20v-24h18M216 194h32v34h26" />
  </g>
}

function River() {
  return <g>
    <path fill="#697651" d="m0 277 73-76 55 59 69-94 103 111v143H0z" />
    <path fill="#284a3b" d="m0 319 83-83 81 78 77-87 59 62v131H0z" />
    <path fill="#d0d09c" d="M191 248c-10 26-75 43-70 68 4 23 61 34 54 57-4 15-24 31-39 47h85c16-22 23-44 9-63-16-20-77-23-78-45-1-20 37-42 39-64" />
    <path fill="none" stroke="#e7d880" strokeWidth="1.4" d="M186 274c-26 20-43 31-32 44M188 350c30 14 28 28 14 43" />
    <path fill="#e7d880" d="M53 282v46h3v-46l12 15-14-35-14 35zM246 298v37h3v-37l9 10-11-28-11 28z" />
    <path fill="#284a3b" d="M51 190h28v2H51zM57 184h15v2H57z" />
  </g>
}

function Design() {
  return <g>
    <path fill="#d6d2c8" d="M50 224h200v123H50z" />
    <path fill="#f8f6ef" d="M50 224h98v123H50z" />
    <path fill="#282a27" d="M50 274h98v73H50zM148 224h102v49H148z" />
    <path fill="#b75e42" d="M148 273h52v74h-52z" />
    <path fill="none" stroke="#282a27" strokeWidth="1" d="M50 212v-11m-12 23H27m235 0h11M50 359v11m200-11v11M38 347H27m235 0h11M148 207v157" />
    <path fill="#282a27" d="M215 293h17v1h-17zM215 300h17v1h-17zM215 307h10v1h-10z" />
    <text x="50" y="389" className="rd-cover__micro" fill="#76786e">FORM · SPACE · EVERYDAY LIFE</text>
  </g>
}

function Galaxy() {
  return <g>
    <path fill="#51496e" d="M0 274 83 243l60 27 63-43 94 36v157H0z" />
    <path fill="#cda0a3" d="m0 314 78-42 83 38 62-37 77 32v115H0z" />
    <path fill="#f1d1ac" d="m0 340 66-24 66 30 63-26 105 30v70H0z" />
    <path fill="#343652" d="m0 365 81-22 78 24 76-19 65 22v50H0z" />
    <path fill="none" stroke="#f1d1ac" strokeWidth="1.1" d="m35 204 57-28 49 22 56-36 64 25M196 154v16m-8-8h16M64 225v9m-4-4h8" />
    <path fill="#f1d1ac" d="M34 202h3v3h-3zM90 175h3v3h-3zM140 197h3v3h-3zM260 186h3v3h-3zM225 212h2v2h-2zM113 234h2v2h-2z" />
    <path fill="none" stroke="#f1d1ac" strokeWidth="1" d="M41 379h61m100 12h57" />
  </g>
}

function Chairs() {
  return <g>
    <path fill="#ddd1c1" d="M35 224h230v144H35z" />
    <path fill="#c8b8ba" d="m35 368 115-73 115 73z" />
    <path fill="#665a74" d="M67 257a9 9 0 0 1 9-9h34a9 9 0 0 1 9 9v49H67zM64 305h59v12H64z" />
    <path fill="#ede2cf" d="M181 257a9 9 0 0 1 9-9h34a9 9 0 0 1 9 9v49h-52zM177 305h59v12h-59z" />
    <path fill="none" stroke="#4f455d" strokeWidth="3" d="M70 317v32m47-32v32m67-32v32m46-32v32" />
    <path fill="none" stroke="#b9a4a7" strokeWidth="1.2" d="M143 246h15m-15 8h10M144 269h15m-10 8h10" />
    <path fill="none" stroke="#665a74" strokeWidth="1" d="M35 368h230" />
    <text x="150" y="390" textAnchor="middle" className="rd-cover__micro" fill="#53495c">每一种人生，都值得被倾听</text>
  </g>
}

function System() {
  return <g>
    <path fill="#d7d0bf" d="m33 286 63-32 64 32-64 33zM160 254l52-27 56 28-55 27z" />
    <path fill="#ae4334" d="M33 286v65l63 33v-65zM160 254v82l53 27v-81z" />
    <path fill="#c3715a" d="M96 319v65l64-33v-65zM213 282v81l55-28v-80z" />
    <path fill="#ae4334" d="M72 202h61v84H72zM83 178h39v24H83zM94 156h17v22H94z" />
    <path fill="#eeeadf" d="M83 216h8v19h-8zM99 216h8v19h-8zM115 216h8v19h-8zM83 245h8v19h-8zM99 245h8v19h-8zM115 245h8v19h-8z" />
    <path fill="none" stroke="#9b927f" strokeWidth="1" d="m24 372 73 37 70-37m6 3 40 20 64-33M44 268l15-8m179-42 18 9" />
    <path fill="none" stroke="#eeeadf" strokeWidth="1" d="m45 309 37 19m-37-6 37 19m-37-6 37 19m153-52 19-10m-19 24 19-10m-19 24 19-10" />
  </g>
}

function Time() {
  return <g>
    <path fill="#294d60" d="m0 328 300-86v178H0z" />
    <path fill="#122331" d="m0 361 300-80v139H0z" />
    <g fill="none" stroke="#acbfc3" strokeWidth="1.1">
      <ellipse cx="152" cy="280" rx="116" ry="43" transform="rotate(-32 152 280)" />
      <ellipse cx="152" cy="280" rx="95" ry="31" transform="rotate(39 152 280)" />
      <path d="m152 197 0 166M54 280h194" opacity=".5" />
    </g>
    <circle cx="152" cy="280" r="30" fill="#edf0df" />
    <path fill="#becdcd" d="M152 250a30 30 0 0 1 0 60c15-17 15-43 0-60" />
    <circle cx="61" cy="322" r="5" fill="#edf0df" />
    <path fill="#edf0df" d="M235 196h3v3h-3zM70 216h2v2h-2zM225 353h2v2h-2zM47 374h2v2h-2z" />
    <text x="150" y="389" textAnchor="middle" className="rd-cover__micro" fill="#afc3c9">FROM THE BIG BANG TO BLACK HOLES</text>
  </g>
}

function Stranger() {
  return <g>
    <path fill="#d5b68c" d="M0 256h300v164H0z" />
    <path fill="#bf503d" d="M0 256h122v164H0z" />
    <path fill="#efcc8b" d="m122 256 178-61v225H122z" />
    <path fill="#f0e6d2" d="m0 256 122-78v78z" />
    <path fill="#bf503d" d="M208 155a32 32 0 1 0 0 64 32 32 0 0 0 0-64" />
    <path fill="#9e3c30" d="m122 347 49 73h44l-71-95z" />
    <path fill="#463f37" d="M136 304h8v34h-8zM130 335h8l-7 26h-5zM143 335h6l7 26h-5z" />
    <circle cx="140" cy="296" r="5" fill="#463f37" />
    <path fill="none" stroke="#bf503d" strokeWidth="1" d="M31 373h55m-55 8h33" />
  </g>
}

const illustrations: Record<string, () => ReactNode> = {
  b1: Cities, b2: River, b3: Design, b4: Galaxy,
  b5: Chairs, b6: System, b7: Time, b8: Stranger,
}

function titleLines(id: string, title: string) {
  const splitAt: Record<string, number> = { b1: 4, b3: 4, b4: 4, b5: 4 }
  const characters = Array.from(title)
  const at = splitAt[id] ?? (characters.length > 7 ? 6 : characters.length)
  return [characters.slice(0, at).join(''), characters.slice(at).join('')].filter(Boolean)
}

export function BookCover({ id, title, author, className = '' }: CoverProps) {
  const theme = themes[id] ?? { paper: '#ded9ce', ink: '#4b514a', eyebrow: 'A PLACE FOR EVERY STORY' }
  const Illustration = illustrations[id]
  const lines = titleLines(id, title)
  const titleSize = id === 'b5' ? 30 : lines.some(line => Array.from(line).length > 5) ? 29 : 36
  return <div className={`rd-cover rd-cover--${themes[id] ? id : 'placeholder'} ${className}`.trim()} role="img" aria-label={`${title}，${author}，示意封面`}>
    <svg viewBox="0 0 300 420" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <rect width="300" height="420" fill={theme.paper} />
      <text x="29" y="35" className="rd-cover__eyebrow" fill={theme.ink}>{theme.eyebrow}</text>
      <text x="27" y="88" className={`rd-cover__title ${id === 'b3' ? 'rd-cover__title--sans' : ''}`} fill={theme.ink} fontSize={titleSize}>
        {lines.map((line, index) => <tspan key={index} x="27" dy={index ? '1.26em' : 0}>{line}</tspan>)}
      </text>
      <text x="29" y={lines.length > 1 ? 160 : 120} className="rd-cover__author" fill={theme.ink}>{author}</text>
      {Illustration ? <Illustration /> : <g fill="none" stroke={theme.ink} strokeWidth="1.2">
        <path d="M54 227h82l14 12 14-12h82v112h-82l-14 12-14-12H54zM150 239v112M72 250h45m-45 12h45m-45 12h31m64-24h45m-45 12h45m-45 12h31" />
        <path d="M54 368h192" opacity=".35" />
      </g>}
    </svg>
  </div>
}
