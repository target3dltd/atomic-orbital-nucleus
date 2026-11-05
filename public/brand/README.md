# Atomic Orbital brand kit

Logo: **Globe A, colour step 3**. Teal and orange, with Space Grotesk headings.

## What is in the folder

| Folder or file | What it is |
|---|---|
| `style-guide.html` | A live page built from the style sheet. Open it in a browser. |
| `css/atomic-orbital.css` | The style sheet: colours for light and dark, type, buttons, cards, header and footer. |
| `css/tokens.json` | The same colours, type and spacing as data, for design tools. |
| `fonts/` | Space Grotesk (web file plus the full set of TTFs) and its licence. |
| `logos/svg/` | Logos as vector files: full lockup, mark only, and the small-size mark. |
| `logos/png/` | Transparent PNGs: mark 2048 x 2048 px, lockup 4096 px wide. |
| `logos/animated/` | The hero logo with its animation built in. Hero banner only. |
| `logos/favicon/` | favicon.svg (follows light or dark), plus 32, 180 and 512 px PNG icons. |
| `snippets/head.html` | The tags to paste into a page's head. |
| `snippets/legal-footer.html` | The company footer with the Legal and Responsibility links. |

## Using the style sheet

1. Keep the folders together, so the font path in the CSS (`../fonts/`) still works.
2. Paste `snippets/head.html` into the head of every page.
3. Light is the default. Dark follows the visitor's device. To force a theme, set `<html data-theme="dark">` or `"light"`.
4. To add a theme switch, change `data-theme` on the html element and save the choice in localStorage. `style-guide.html` shows a working example.

## Colours

| | Light | Dark |
|---|---|---|
| Background | `#F4F6F8` | `#0A0E14` |
| Surface | `#FFFFFF` | `#121923` |
| Line | `#D5DCE4` | `#243040` |
| Muted text | `#4A5A6B` | `#A3B0BF` |
| Text | `#0E1620` | `#E8EEF5` |
| Teal (logo) | `#04959B` | `#08DADB` |
| Teal (text and links) | `#03797F` | `#08DADB` |
| Orange | `#F2531A` | `#FF5B38` |
| Text on orange | `#0E1620` | `#0A0E14` |
| Green (conservation) | `#2E7D4F` | `#6FE3A0` |

Rough balance: 70% neutrals, 20% teal, 10% orange.

## Type

- **Headings:** Space Grotesk SemiBold (600).
- **Body:** IBM Plex Sans, 17 px, line height 1.6.
- **Figures and codes:** IBM Plex Mono.
- IBM Plex Sans and Mono are **not** in this kit. They are free (SIL Open Font License) from Google Fonts or IBM. Until you add them, body text uses the device's own font.

## Rules for the logo

- Use the **for-dark-backgrounds** files on dark backgrounds and **for-light-backgrounds** on light ones.
- Clear space of one eighth of the logo's width on every side.
- Minimum size 24 px on screen, 8 mm in print. At 44 px and under, use the small-size mark.
- Never rotate the A, swap the teal and orange, or recolour the orange.
- The animated version is for the hero banner only, and it stops for visitors who prefer reduced motion.
- One orange per view. Buttons use orange with dark text, not white.

## Company details

ATOMIC ORBITAL LIMITED, registered in England and Wales, company number 17518955.
Registered office: 66 Paul Street, London, England, EC2A 4NA.
Email: info@atomicorbital.co.uk

## Licences

Space Grotesk is licensed under the SIL Open Font License 1.1 (see `fonts/OFL.txt`). Keep that file with the fonts if you pass them on.
