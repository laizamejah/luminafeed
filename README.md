# Lumina

Build a production-ready, fully functional social media application called "Lumina"that looks exactly and factions like Instagram . It should look and feel premium, minimalist, and tailored for photography purists. Connect it to Supabase for real user authentication, database management, and media storage.

Implement the following core infrastructure and specific features step-by-step:

1. AUTHENTICATION & PROFILES

- Set up Supabase Auth for email signup/login.

- Create a 'profiles' table with: id (UUID, references auth.users), username (unique), display_name, avatar_url, bio, and a boolean 'show_metrics_publicly' (default: false).

2. CORE POSTING ENGINE (ZERO-COMPRESSION & ASPECT RATIO FREEDOM)

- Create a 'posts' table with: id, user_id (references profiles), captions, created_at, geolocation (latitude, longitude, or point), and a boolean 'comments_enabled' (default: true).

- Allow users to upload multiple high-fidelity, uncompressed images per post (stored in a Supabase bucket). 

- Do not force images into squares or predefined crops. In the UI feed, render posts dynamically maintaining their original aspect ratios (panoramas, vertical portrait, landscape) beautifully without ugly black borders.

- Allow 'Joint Carousels': Create a 'post_collaborators' table so the post owner can invite other users to contribute images/slides to that specific carousel post.

3. TOTAL ALGORITHM & FEED CONTROL

- Create a 'follows' table that includes a 'tier' column with values: 'close_friend', 'acquaintance', or 'public'.

- The Home Feed must be strictly chronological based on 'created_at DESC' of people the user follows. No AI-suggested algorithmic posts.

- Add a persistent filter bar at the top of the feed allowing the user to instantly filter their timeline by relationship tiers: "All", "Close Friends", or "Acquaintances".

- Add a layout toggle setting to completely hide short-form videos/reels from the feed, leaving a pure, static photo layout for photography enthusiasts.

4. LOW-PRESSURE SOCIAL INTERACTION

- Hide like counts, follower counts, and view counts by default. Only display them publicly if a user explicitly toggles 'show_metrics_publicly' to true in their profile settings. Users should always be able to see their own metrics privately.

- If a post has 'comments_enabled' set to false, hide the public comment section and replace the comment icon with a "Send Private DM" button that initiates a direct message.

5. INTERACTIVE DISCOVERY MAP

- Integrate an interactive map (using Leaflet or Mapbox) on a dedicated search/discovery page.

- Fetch posts containing geolocation data and place pins on the map in real-time. Clicking a pin should open a sleek modal previewing that user's high-res photo and profile.

Build the navigation using a clean sidebar or bottom tab menu (Home Feed, Discovery Map, Create Post, Profile/Settings). Ensure the UI is responsive, fast, and handles image loading gracefully using loading skeletons.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/05a501c2-7733-4b82-a5d5-c3d63e59f427).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
