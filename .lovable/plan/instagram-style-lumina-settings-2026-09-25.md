# Instagram-style Lumina settings

## What will change
- Replace the current long form with a mobile-first **Settings and activity** screen matching the supplied Instagram references: fixed back/title bar, search, grouped white menu rows, section dividers, line icons, current values, and chevrons.
- Keep the page clean on phones while using a centered, comfortable width on tablets and computers.
- Remove the profile editor and large toggle cards from the main settings list; they will open as focused detail screens instead.

## Working sections
- **Your account:** profile photo, display name and bio editing; password-reset email; appearance/theme; sign out.
- **How you use Lumina:** saved items, archived chats, activity, notifications, and time-management controls.
- **Who can see your content:** public-count visibility, Close Friends, blocked accounts, story/location choices, and family supervision.
- **How others interact with you:** message notifications, comments, tags/mentions, sharing, and restricted/blocked management.
- **What you see:** feed layout, hide short videos, content preferences, and count visibility.
- **Your app and media:** theme, media quality, downloads, accessibility, and language choices.
- **Commerce and support:** orders, verified-seller status, help, privacy information, account status, and About Lumina.

## Interaction behavior
- Every row will open a matching detail view or an existing Lumina destination; no dead rows.
- Existing Lumina settings will save to the account immediately or through a clear Save action, with success/error feedback.
- Search will filter to real settings and open the selected result.
- Unsupported Instagram-only products will be replaced by relevant Lumina destinations rather than copied as fake controls.
- Back controls will return from a detail view to the main settings list, then back to the previous Lumina screen.

## Technical details
- Reuse the current profile fields, blocked users, conversations, friend/follow data, marketplace orders, child-account setup, theme provider, and existing app routes.
- Add small focused settings components where needed instead of one oversized page.
- Preserve the current authentication and privacy rules; no placeholder data or simulated actions.
- Add page-specific metadata and verify the settings flow at mobile and desktop sizes.
