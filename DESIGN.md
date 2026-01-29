# RareGen Design System & Brand Guidelines

**Brand Identity:** Lion Rasta Theme  
**Last Updated:** January 29, 2026

---

## 🦁 Brand Concept

**Core Identity:** Strength, wisdom, and freedom in digital rights management

- **Lion:** Represents strength, authority, protection of creators' rights
- **Rasta:** Symbolizes freedom, resistance against centralized control, unity
- **Combined:** Powerful, non-custodial rights management that empowers creators

---

## 🎨 Color Palette

### Primary Colors (Rasta-Inspired)

```css
/* Rasta Red - Passion, Strength */
--rasta-red: #E8222E;
--rasta-red-dark: #C41E3A;
--rasta-red-light: #FF4444;

/* Rasta Gold/Yellow - Prosperity, Wealth */
--rasta-gold: #FFC627;
--rasta-yellow: #FFD700;
--rasta-gold-dark: #E6A700;

/* Rasta Green - Growth, Nature, Freedom */
--rasta-green: #009E60;
--rasta-green-dark: #007A45;
--rasta-green-light: #00C17C;
```

### Supporting Colors

```css
/* Earth Tones */
--lion-brown: #8B4513;
--lion-tan: #D2B48C;
--lion-mane: #CD853F;

/* Neutrals */
--dark-bg: #1A1A1A;
--charcoal: #2D2D2D;
--warm-grey: #4A4A4A;
--off-white: #F5F5DC;
--cream: #FFFACD;
```

### Blockchain Accent Colors

```css
/* BSV Brand Colors */
--bsv-gold: #EAB300;
--bsv-blue: #0092DD;

/* Status Colors */
--success-green: #00C17C;
--warning-gold: #FFC627;
--error-red: #E8222E;
--pending-yellow: #FFD700;
```

---

## 🎭 Typography

### Font Families

**Headers:** 
- Primary: "Montserrat" (bold, powerful)
- Alternative: "Bebas Neue" (strong, modern)

**Body Text:**
- Primary: "Open Sans" (clean, readable)
- Alternative: "Lato" (professional)

**Monospace (Code/Keys):**
- "Fira Code" or "JetBrains Mono"

### Font Scales

```css
--text-xs: 0.75rem;    /* 12px - Labels */
--text-sm: 0.875rem;   /* 14px - Secondary */
--text-base: 1rem;     /* 16px - Body */
--text-lg: 1.125rem;   /* 18px - Large body */
--text-xl: 1.25rem;    /* 20px - Small heading */
--text-2xl: 1.5rem;    /* 24px - Section heading */
--text-3xl: 1.875rem;  /* 30px - Page heading */
--text-4xl: 2.25rem;   /* 36px - Hero */
--text-5xl: 3rem;      /* 48px - Landing hero */
```

---

## 🦁 Visual Elements

### Lion Imagery

**Logo Concept:**
- Stylized lion head (profile or frontal)
- Mane incorporating rasta colors (red/gold/green gradient or stripes)
- Minimalist, modern, powerful
- Works in monochrome and color

**Usage:**
- App icon
- Hero sections
- Loading states (animated mane)
- Empty states
- Success confirmations

### Patterns & Textures

**Rasta Stripes:**
- Horizontal: Red → Gold → Green (top to bottom)
- Use as accents: dividers, progress bars, borders
- Subtle gradients rather than hard lines

**Geometric Patterns:**
- Hexagonal patterns (blockchain/strength)
- Lion mane-inspired radiating lines
- Sacred geometry subtly in backgrounds

**Textures:**
- Canvas/fabric texture for warmth
- Subtle noise for depth
- Woodgrain for dashboard backgrounds (optional)

---

## 🎬 UI Components

### Buttons

**Primary Action (Call-to-Action):**
```css
background: linear-gradient(135deg, var(--rasta-gold), var(--rasta-green));
color: var(--dark-bg);
font-weight: 700;
border-radius: 8px;
box-shadow: 0 4px 12px rgba(255, 198, 39, 0.3);
transition: transform 0.2s, box-shadow 0.2s;

/* Hover */
transform: translateY(-2px);
box-shadow: 0 6px 20px rgba(255, 198, 39, 0.5);
```

**Secondary:**
```css
background: transparent;
border: 2px solid var(--rasta-gold);
color: var(--rasta-gold);
```

**Danger/Warning:**
```css
background: var(--rasta-red);
color: var(--off-white);
```

### Cards

**Dashboard Cards:**
```css
background: linear-gradient(145deg, #2D2D2D, #1A1A1A);
border: 1px solid rgba(255, 198, 39, 0.1);
border-radius: 12px;
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
padding: 24px;
```

**Accent Border (Active/Selected):**
```css
border-image: linear-gradient(135deg, 
  var(--rasta-red), 
  var(--rasta-gold), 
  var(--rasta-green)
) 1;
```

### Key Display Components

**Public Key Card:**
```css
background: var(--charcoal);
border-left: 4px solid var(--rasta-gold);
padding: 16px;
font-family: 'Fira Code', monospace;
font-size: var(--text-sm);
color: var(--rasta-gold);
```

**Address Display:**
```css
background: rgba(255, 198, 39, 0.1);
border: 1px dashed var(--rasta-gold);
padding: 12px;
border-radius: 8px;
```

### Status Indicators

**Published (Success):**
```css
background: var(--rasta-green);
color: white;
```

**Queued (Pending):**
```css
background: var(--rasta-gold);
color: var(--dark-bg);
```

**Failed (Error):**
```css
background: var(--rasta-red);
color: white;
```

**Processing (Loading):**
```css
background: linear-gradient(90deg, 
  var(--rasta-red) 0%, 
  var(--rasta-gold) 50%, 
  var(--rasta-green) 100%
);
animation: shimmer 2s infinite;
```

---

## 🌟 Animations

### Loading States

**Lion Roar Loading:**
- Animated lion icon with mane pulsing in rasta colors
- Particles flowing outward
- "Roaring your rights onto the blockchain..." message

**Progress Bar:**
```css
background: linear-gradient(90deg, 
  var(--rasta-red), 
  var(--rasta-gold), 
  var(--rasta-green)
);
animation: progress-shine 1.5s infinite;
```

### Micro-interactions

**Success Confirmation:**
- Lion roar icon appears
- Rasta colors ripple outward
- Haptic feedback (mobile)

**Key Generation:**
- Animated lock → lion → checkmark
- Rasta color particle effects

**Transaction Broadcasting:**
- Radio wave animation in rasta colors
- Growing circles emanating from center

---

## 📱 Layout & UX

### Dashboard Layout

**Sidebar Navigation:**
```
┌─────────────────────────────┐
│ 🦁 RareGen                  │
│ ───────────────────────────│
│ 📊 Dashboard                │
│ 📝 Publish                  │
│ 🔑 Keys                     │
│ 💰 Wallet                   │
│ 📜 History                  │
│ ⚙️  Settings                │
│                             │
│ [Rasta stripe accent]       │
│                             │
│ Credits: 150 🟡             │
└─────────────────────────────┘
```

**Main Content Area:**
- Dark background (--dark-bg)
- Cards with subtle elevation
- Rasta accent colors for CTAs
- Lion watermark in hero sections

### Mobile Design

**Bottom Navigation:**
- Dark bar with rasta underline on active tab
- Lion icon for home
- Simple, bold icons
- Haptic feedback on tap

---

## 🎨 Page-Specific Design

### Landing Page

**Hero Section:**
```
[Large Lion Icon with Rasta Mane]

"Roar Your Rights on the Blockchain"

Subtitle: "Non-custodial, investor-grade digital rights 
management powered by BSV"

[CTA Button: Get Started - Gold/Green gradient]
```

### Registration Flow

**Key Generation Page:**
```
Step 1/3: Creating Your Keys

[Animated Lion with flowing mane in rasta colors]

"Generating your 3 keypairs..."
• Identity Key 🔐 [Green checkmark]
• Financial Key 💰 [Gold checkmark]
• Tokens Key 🎫 [Red checkmark]

"Creating 5 Shamir shares for recovery..."
[Progress bar with rasta gradient]
```

### Dashboard

**Stats Cards:**
```
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ 📊 Published  │  │ 💰 Earned     │  │ 🎫 Credits    │
│ 24 Records    │  │ 0.0015 BSV    │  │ 150 / 200     │
│ [Green accent]│  │ [Gold accent] │  │ [Red accent]  │
└───────────────┘  └───────────────┘  └───────────────┘
```

### Key Management Page

**Key Display:**
```
🔐 Identity Key
[Lion icon with red accent]
Address: 1ENww...ufiraA
[Copy] [QR Code] [Details]

💰 Financial Key  
[Lion icon with gold accent]
Address: 1H5Tt...cLinuw1
[Copy] [QR Code] [Details]

🎫 Tokens Key
[Lion icon with green accent]
Address: 1L9uB...grkqPsR
[Copy] [QR Code] [Details]

─────────────────────────────
Backup Status: ✅ 5/5 Shares Secured
[Rasta stripe indicator]

[Test Recovery] [Download Shares] [View Details]
```

### Transaction History

**Transaction Row:**
```
[Icon] REGISTER - Music Rights
REC-1769722193914
Jan 29, 2026 • Territory: US
Status: Published ✅ [Green badge]
TxID: b63678a1c9... [View on Chain →]
```

---

## 🖼️ Iconography

### Custom Icons (Lion-Themed)

- **Dashboard:** Lion head frontal
- **Publish:** Lion roaring (sound waves)
- **Keys:** Lion with three keys in mane
- **Wallet:** Lion with coin
- **History:** Lion paw prints timeline
- **Settings:** Lion gear/cog
- **Security:** Lion with shield
- **Success:** Lion with checkmark
- **Warning:** Lion with alert
- **Error:** Lion with X

### Icon Style
- Line art or duotone
- 2px stroke weight
- Rounded corners
- Rasta color accents on hover/active

---

## 🎯 Brand Voice

### Tone
- **Powerful** but not aggressive
- **Confident** but not arrogant
- **Free** but not chaotic
- **Wise** but not preachy

### Messaging Examples

**Hero Copy:**
- "Roar Your Rights on the Blockchain"
- "Freedom Through Cryptography"
- "Your Keys, Your Kingdom"

**Feature Descriptions:**
- "Lion-Strength Security" (Shamir Secret Sharing)
- "Rasta Freedom" (Non-custodial)
- "Blockchain Pride" (BSV publishing)

**Error Messages:**
- "The lion stumbled..." (instead of "Error")
- "Let's try that roar again..." (retry)

**Success Messages:**
- "Rights published! 🦁"
- "The pride protects your creation"
- "Roared onto the blockchain!"

---

## 🚀 Implementation Notes

### CSS Variables Setup

```css
:root {
  /* Rasta Colors */
  --rasta-red: #E8222E;
  --rasta-gold: #FFC627;
  --rasta-green: #009E60;
  
  /* Lion Colors */
  --lion-brown: #8B4513;
  --lion-tan: #D2B48C;
  
  /* Dark Theme */
  --bg-primary: #1A1A1A;
  --bg-secondary: #2D2D2D;
  --text-primary: #F5F5DC;
  --text-secondary: #D2B48C;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  
  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-gold: 0 4px 12px rgba(255, 198, 39, 0.3);
}
```

### Component Library Recommendations

**React/Vue:**
- Material-UI or Ant Design (customizable)
- Tailwind CSS (excellent for custom themes)
- Framer Motion (animations)

**Chart Library:**
- Recharts or Chart.js with custom rasta colors

**Icon Library:**
- Custom lion-themed SVG icons
- Heroicons or Feather Icons as base
- Colorize with rasta palette

---

## 📋 Design Checklist

- [ ] Create lion logo SVG (multiple variations)
- [ ] Design rasta stripe pattern assets
- [ ] Create icon set (dashboard, publish, keys, etc.)
- [ ] Build component library in Storybook
- [ ] Design dark theme (primary)
- [ ] Design light theme (optional, low priority)
- [ ] Create loading animations
- [ ] Design empty states with lion mascot
- [ ] Email templates with rasta theme
- [ ] PDF receipt/backup designs
- [ ] QR code recovery sheet template
- [ ] Social media graphics
- [ ] Favicon and app icons

---

## 🎨 Inspiration References

**Visual Style:**
- Ethiopian/Rastafarian art (geometric patterns)
- Sacred geometry
- Modern crypto dashboard UIs (clean, dark)
- Lion conservation branding (WWF, etc.)
- Reggae album art (Bob Marley, etc.)

**Color Balance:**
- Don't overuse rasta colors (accents only)
- Dark background dominates (90%)
- Rasta colors highlight important elements (10%)
- Gold for primary CTAs
- Green for success/confirmation
- Red for warnings/important notices

---

**Next Steps:**
1. Create lion logo variations (designer)
2. Build Figma/Sketch design system
3. Prototype key screens (registration, dashboard, publish)
4. User testing with target audience
5. Iterate based on feedback

---

*"In the pride of the blockchain, your rights roar eternal."* 🦁
