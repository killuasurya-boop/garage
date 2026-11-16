---
name: garage-member-cx
description: Aturan WAJIB member & pelanggan: IMMUTABLE UI DESIGN CONTRACT member (Crystal V5, Member V6, kartu member), Invoice Digital V4 / CX Engine, Member OTP WhatsApp & kode klaim kasir. Muat sebelum menyentuh /member-login, layar member, kartu member, /invoice, atau OTP.
---

# garage-member-cx

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

## GARAGE COFFEE — IMMUTABLE UI DESIGN CONTRACT

**Scope.** Member (customer) UI: `/member-login` and future member screens. Staff/ops UI keeps `design-system/MASTER.md`.

**Crystal V5 override (owner, 8 Nov 2026).** The palette/typography in the documents below is superseded by Garage Crystal V5
(`docs/crystal-v5/01-DESIGN-SYSTEM.md`, `--gc-*` tokens, Montserrat display + Inter body). All other rules here (official logo,
no automotive imagery, real member data, reduced motion, no fake OAuth/OTP, responsive QA) still apply. Google sign-in is
allowed once `MEMBER_GOOGLE_CLIENT_ID`/`_SECRET` (fallback: the existing `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`) are configured on
the server (button hidden otherwise): code + PKCE,
server-verified ID token (`src/lib/member-google-oauth.ts`), link by `google_sub` then Google-verified email (no duplicates),
new accounts complete name + WhatsApp + S&K, marketing consent separate & default off (migration 0184, `docs/crystal-v5/02-GOOGLE-LOGIN.md`).
An existing phone account is linked only after its PIN (`completeGoogleMember`, pin-guard); Google-only accounts may set a first PIN
without the old one while `member_accounts.pin_set_at` is null (migration 0185).
**Member V6 (owner, 9 Nov 2026).** `/member-login` follows `docs/design-references/member-v6/` (`docs/crystal-v5/03-MEMBER-V6.md`):
real Three.js cards (`member-auth/cinematic3d/`, lazy, adaptive quality, CSS fallback without WebGL, no chip/NFC), showcase left +
glass panel right (`member-v6.css`), intro once per session, register needs S&K (`acceptTerms` → `terms_accepted_at`), success
screen shows the tier returned by the backend. `MemberLoginCard`/`BrandExperiencePanel`/`CinematicBackground` are no longer used by the page.

**Sources of truth.** Before you touch member UI, read all three:
- `docs/GARAGE_MEMBER_DESIGN_SYSTEM.md`
- `docs/GARAGE_MEMBER_MOTION_SPEC.md`
- the approved screenshots in `docs/design-references/member-login/` (`desktop`, `tablet` and `mobile.webp`)

**Implementation.**
- Components: `src/components/garage/member-auth/`.
- Tokens and primitives: `member-auth.css`, using `gm-*` classes scoped to `.gm-root`.

**Rules.**
1. Always read the approved design-system document before modifying member UI.
2. Always inspect the approved screenshots before changing visual components.
3. Never change the approved brand colors, typography (Space Grotesk headings, Inter body) or visual hierarchy without owner authorization.
4. Never redesign the Garage Coffee logo. Use `GarageBrandLogo` (official PNG, `object-contain`).
5. Never replace the visual style with a generic template.
6. Always reuse the shared components (`MemberField`, `MemberButton`, `MemberLoginCard`, `AuthenticationStatus`, `MotionReveal`, `CinematicBackground`) and the `--gm-*` tokens. Do not hand-roll duplicate styles.
7. Always keep desktop (split ≥1024), tablet (centered) and mobile (form first) consistent.
8. Never introduce an unrelated visual identity. No automotive or motorcycle imagery in member UI.
9. Never sacrifice usability for motion. The UI must work fully with `prefers-reduced-motion`.
10. Always run responsive visual QA after member UI changes: 1440×900, 1920, 1366, 1024×768, 768×1024, 390×844 and 360. Check for no horizontal overflow, clipping or overlap.
11. Never modify unrelated Garage OS modules as part of member UI work.
12. Preserve member authentication: phone/email + PIN via `/api/member/auth/*` with JWT cookies, plus the `next`, `mode=register`, `ref`, `name` and `phone` URL params. Never expose credentials.
13. Never invent unavailable member data or features. No fake OAuth/OTP buttons: Google/OTP appear only once a real provider is configured.
14. State any proposed deviation from the approved design before implementing it.

15. Member card = `PremiumMembershipCard` (`src/components/garage/premium-membership-card.tsx` + `.css`). Card data for the screen, PNG/JPG (`membership-card-image.ts`) and PDF (`membership-card-pdf.ts`) comes only from `src/lib/membership-card-model.ts`:
    - the real member code (never zero-padded);
    - "Berlaku s/d" from `expiresAt`, never from the member-since date;
    - perks and multiplier from `memberLevelRules`;
    - a real QR `{v:1,id,tier,n}`, dark on a white plate;
    - no bank-card props (CVV, signature, magstripe, fake barcode) and no fake address or phone placeholders.

Design consistency is a mandatory acceptance criterion for every member UI change.


- Invoice Digital V4 / CX Engine (owner, Nov 2026, migration 0182, `docs/CX-ENGINE-V4.md`): `/invoice/[token]` =
  components in `src/components/garage/invoice-v4/` (`iv-*` CSS in `@layer components`). Pure rules: `invoice-v4.ts`
  (payment state via `paymentStatusOf`, 5-step flow, station cards, `maskPhone`), `customer-offers.ts` (eligibility,
  `voucherEffectiveStatus`, `verifiedTierBenefits` from Settings point rules — never unimplemented perks), `cx-whatsapp.ts`,
  `cx-events.ts`; server `customer-experience-service.ts`. Invoice token ≠ account ownership: member data only from the
  member session, invoices are never linked to a member from the public page. "Saya Sudah Bayar" only opens WA proof help.
  wa.me clicks = "opened", never "sent". Promo WA needs latest `customer_marketing_consents` = granted + max 1/7 days.
  Events (`customer_experience_events`) carry no phone/PIN/token/IP.
- Member OTP WhatsApp (owner Nov 2026, migration 0183, `docs/MEMBER-OTP-WHATSAPP.md`): rules pure in `member-otp-rules.ts`,
  server `member-otp.ts`, UI `member-auth/member-phone-otp.tsx` (shown only when the provider is configured — no fake OTP).
  Codes/tokens stored only as HMAC in `member_otp_challenges`; sent straight to Cloud API (never via `whatsapp_messaging_queue`).
  `registerMember` refuses to merge a POS customer with history (points/visits/paid order) unless `phoneVerified`; OTP active
  = every registration needs `otpToken`. Never name a public-route function `verifyMember*` (matches a guard pattern). Without Meta, "Kode klaim kasir" works the same way: POS
  `POST /api/pos/member/claim-code` (crm-only customer, 15 min, HMAC, `delivery_status='cashier'`) →
  member enters it via "Punya kode dari kasir?" (`/api/member/auth/claim/verify`) → same OTP token → `phoneVerified`.
