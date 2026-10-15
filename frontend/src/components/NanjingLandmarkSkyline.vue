<template>
  <figure class="nanjing-skyline" data-testid="nanjing-skyline">
    <svg
      viewBox="0 -8 420 126"
      role="img"
      aria-label="南京景点轮廓，从左到右：中山陵、阅江楼、鸡鸣寺塔、中华门与南京眼"
    >
      <defs>
        <filter id="skyline-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="grayNoise" />
          <feComponentTransfer in="grayNoise" result="faintNoise">
            <feFuncA type="table" tableValues="0 0.055" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="faintNoise" mode="multiply" />
        </filter>
      </defs>
      <g filter="url(#skyline-grain)">
        <rect x="0" y="104" width="420" height="14" fill="#DCD2BB" />
        <path d="M0 104.5H420" stroke="#C3B99F" stroke-width="1" />
        <g data-attraction-id="attr_001">
          <rect x="24" y="50" width="40" height="39" fill="#F4F0E5" />
          <path d="M57 50H64V89H57Z" fill="#D9DFD8" />
          <path
            d="M23 32Q44 35 65 32L68 44Q72 47 76 45Q70 53 63 53H25Q18 53 12 45Q17 47 20 44Z"
            fill="#244D76"
          />
          <path d="M24 34Q44 37 64 34L67 44H21Z" fill="#376A91" />
          <path d="M24 54H64V61H24Z" fill="#FFFCF1" />
          <path d="M24 60H64L72 66H16Z" fill="#244D76" />
          <path d="M37 89V77A7 7 0 0 1 51 77V89Z" fill="#38626E" />
          <path d="M37 77A7 7 0 0 1 51 77" stroke="#C9D4D1" stroke-width="1.5" />
          <g fill="#ADBEB5">
            <rect x="22" y="89" width="44" height="4" />
            <rect x="18" y="93" width="52" height="4" />
            <rect x="14" y="97" width="60" height="4" />
            <rect x="10" y="101" width="68" height="3" />
          </g>
          <path d="M22 90H66M18 94H70M14 98H74M10 102H78" stroke="#F4F0E5" />
        </g>
        <g data-attraction-id="attr_019">
          <rect x="86" y="86" width="52" height="18" fill="#C13F2C" />
          <path d="M78 87 q6-9 18-10 h44 q12 1 18 10 z" fill="#22383E" />
          <rect x="94" y="70" width="36" height="16" fill="#C13F2C" />
          <path d="M84 71 q5-8 15-9 h26 q10 1 15 9 z" fill="#22383E" />
          <path d="M96 62 q8-12 16-13 q8 1 16 13 z" fill="#22383E" />
          <g fill="#EFE7D6">
            <rect x="98" y="90" width="8" height="10" />
            <rect x="118" y="90" width="8" height="10" />
            <rect x="106" y="74" width="12" height="10" />
          </g>
        </g>
        <g data-attraction-id="attr_017">
          <rect x="176" y="88" width="30" height="16" fill="#C13F2C" />
          <path d="M168 89 q5-7 12-8 h22 q9 1 12 8 z" fill="#22383E" />
          <rect x="179" y="74" width="24" height="14" fill="#C13F2C" />
          <path d="M172 75 q4-6 10-7 h18 q8 1 10 7 z" fill="#22383E" />
          <rect x="182" y="61" width="18" height="13" fill="#C13F2C" />
          <path d="M176 62 q3-6 8-7 h14 q7 1 8 7 z" fill="#22383E" />
          <rect x="184" y="49" width="14" height="12" fill="#C13F2C" />
          <path d="M179 50 q3-5 6-6 h12 q5 1 6 6 z" fill="#22383E" />
          <rect x="186" y="38" width="10" height="11" fill="#C13F2C" />
          <path d="M182 39 q2-5 5-6 h8 q4 1 5 6 z" fill="#22383E" />
          <path d="M191 38 V24" stroke="#D6A231" stroke-width="2" />
          <circle cx="191" cy="23" r="2.8" fill="#D6A231" />
          <g fill="#F3EBDA" opacity=".9">
            <path d="M187 94 a4 4 0 0 1 8 0 v10 h-8 z" />
            <path d="M188 80 a3 3 0 0 1 6 0 v8 h-6 z" />
          </g>
        </g>
        <g data-attraction-id="attr_014">
          <path d="M232 104 L238 60 H322 L328 104 Z" fill="#D9C29B" />
          <path d="M232 104 L238 60 H258 L254 104 Z" fill="#C7AA80" />
          <g stroke="#BC9C6D" stroke-width="1" opacity=".5">
            <path d="M236 74 H324 M234 88 H326" />
          </g>
          <path d="M266 104 V84 a14 14 0 0 1 28 0 V104 Z" fill="#8A6C48" />
          <path d="M270 104 V85 a10 10 0 0 1 20 0 V104 Z" fill="#4A3826" />
          <path d="M246 104 V92 a7 7 0 0 1 14 0 V104 Z" fill="#8A6C48" />
          <path d="M300 104 V92 a7 7 0 0 1 14 0 V104 Z" fill="#8A6C48" />
          <rect x="236" y="53" width="88" height="8" fill="#C7AA80" />
          <g fill="#C7AA80">
            <rect x="238" y="45" width="11" height="8" />
            <rect x="256" y="45" width="11" height="8" />
            <rect x="274" y="45" width="11" height="8" />
            <rect x="292" y="45" width="11" height="8" />
            <rect x="310" y="45" width="11" height="8" />
          </g>
        </g>
        <g data-attraction-id="attr_030">
          <path d="M340 104 H420 V96 H340 Z" fill="#EFE7D6" />
          <path
            d="M352 96 Q346 48 374 30"
            stroke="#4E7C89"
            stroke-width="4.5"
            fill="none"
            stroke-linecap="round"
          />
          <path
            d="M400 96 Q406 48 378 30"
            stroke="#6E9AA5"
            stroke-width="4.5"
            fill="none"
            stroke-linecap="round"
          />
          <g stroke="#8FB3BB" stroke-width="1" opacity=".85">
            <path
              d="M356 96 L368 38 M364 96 L372 33 M376 96 L376 31 M396 96 L384 38 M388 96 L381 33"
            />
          </g>
          <circle cx="376" cy="30" r="3.4" fill="#D6A231" />
        </g>
        <g fill="#55704A" opacity=".9">
          <ellipse cx="160" cy="96" rx="12" ry="9" />
          <ellipse cx="216" cy="98" rx="10" ry="8" />
          <ellipse cx="336" cy="96" rx="11" ry="8" />
        </g>
        <g fill="#3E5540">
          <rect x="158" y="96" width="4" height="9" />
          <rect x="214" y="98" width="4" height="7" />
          <rect x="334" y="96" width="4" height="9" />
        </g>
      </g>
    </svg>
    <figcaption>从左到右：中山陵 · 阅江楼 · 鸡鸣寺塔 · 中华门 · 南京眼</figcaption>
  </figure>
</template>
