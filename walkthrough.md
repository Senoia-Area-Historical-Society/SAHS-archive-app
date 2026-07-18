# Walkthrough: Folder Map View, Personal Map View, & Personal Bouncing Map Pins

We have successfully designed, built, and integrated both the **Folder-specific Map View**, the global **"My Research Map"**, and an exceptionally interactive **Personal Map Pins** feature into the SAHS Research Workspace under your git branch **`update/membership-benefits`**!

These features allow researchers to easily visualize, locate, and explore the spatial contexts of their bookmarked historical places, buildings, cemetery locations, and landmark figures—both inside individual folders and compiled globally across their entire research workspace—while also dropping their own private research annotations directly on the map.

---

## 🛠️ Key Components & Changes Implemented

### 1. **Interactive Private Pin Dropping**: [FolderMapView.tsx](src/components/FolderMapView.tsx)
We added a dedicated private map-annotation system that is strictly visible *only* to the active logged-in researcher:
* **"Drop Personal Pin" Control Bar**:
  * Toggles a premium cursor crosshair mode over the map canvas.
  * Displays a helpful floating instructions banner when active: *"📍 Click anywhere on the map to drop a private pin"*.
  * Captures clicked coordinates dynamically utilizing React Leaflet's `useMapEvents` handler.
* **Drop Personal Pin Modal Entry Form**:
  * Displays clicked latitude and longitude coordinates.
  * Captures the custom **Pin Title**, **Description / Notes**, **Historical Date / Period** (optional), and **Physical Address** (optional) inside a premium heritage modal form.
  * Saves to a new, highly secure `personal_pins` root collection in Firestore.
* **Custom Crimson Bouncing Markers**:
  * Plotted on the map canvas using a unique crimson circular pin icon styled with a white border, drop-shadow, and playfulness-oriented **bounce animation** to make them visually stand out from standard database items.
  * Custom private annotation popups that let researchers read their notes and delete the pin directly when their task is finished.
* **Interactive Sidebar catalog integration**:
  * Compiles personal pins inside a dedicated **"📌 Personal Research Pins (Private)"** section in the left sidebar list.
  * Features the same smooth **"Locate"** pan-and-popup functionality to instantly slide the map and reveal your private note.

### 2. **Firestore Security Rules**: [firestore.rules](file:///\\wsl.localhost\Ubuntu\home\catnolan\SAHS-archive-app\firestore.rules)
* Created rigorous, strict security rules for the `personal_pins` collection.
* Allow read, write, update, and delete actions **strictly** only if the authenticated user's email matches the `ownerEmail` field of the pin. Other users cannot see, fetch, or modify your pins in any way.

### 3. **Global "My Research Map" Page**: [MyResearchMap.tsx](src/pages/MyResearchMap.tsx)
* Queries and compiles all bookmarks across all folders.
* Renders the custom `FolderMapView` which automatically loads your private pins globally, so all your custom spatial annotations appear alongside your bookmarked archive documents!

---

## 🚀 How to Preview Locally

1. Ensure your local dev server is running on **[http://localhost:5175/](http://localhost:5175/)** (it is active in your background terminal).
2. Open the page in your browser and click on **"My Research Map"** or open any active research folder and click the **"Map"** toggle button.
3. Click the **"Drop Personal Pin"** button at the top-left of the map canvas.
4. Click anywhere on the Senoia map!
5. Complete the private pin form (Title, Description) and click **"Save Private Pin"**.
6. The custom bouncing pin will drop onto the map and be listed in your **"Personal Research Pins"** sidebar directory! Click **"Locate"** next to it to watch the map smoothly glide back to it.

---

## 📚 ISBN Scraper Fallback (isbnsearch.org)

To support lookup for books that are missing from both Open Library and Google Books (such as *Cowetta County Chronicles*, ISBN `0-89308-016-0`), we added:
1. **Functions Backend (`functions/index.js`)**: A custom scraper function `lookupIsbnFallback` that fetches details directly from `isbnsearch.org` and parses the metadata (Title, Authors, Publisher, Publication Year, Cover Art) on the server, completely bypassing browser CORS constraints.
2. Frontend Pages (`AddBook.tsx` & `EditBook.tsx`)**: Integrates this Cloud Function as the final fallback in the ISBN search utility (`handleIsbnLookup`), so users can search for any book by its ISBN number and have details auto-populated immediately.

---

## 🔍 Full-Screen Image Zoom Lightbox Fix

We resolved a major usability bug where selecting an archive item's image to get a closer view failed to display full-screen and did not allow zooming.

### The Problem
1. **Stacking Context Confinement**:
   - The archive details page (`ItemDetail.tsx`) is wrapped in an animated container (`animate-in fade-in`).
   - In CSS, any animation/transform/filter on an element forces the browser to create a new stacking context for it.
   - Because of this, the `fixed z-[2000]` lightbox overlay was trapped inside the `ItemDetail` container, confining it underneath the layout's sticky sidebar (`z-30`) and absolute header components. This cropped the lightbox and prevented it from displaying full-screen.
2. **Invalid Tailwind Color Opacity**:
   - The lightbox backdrop used `bg-charcoal/95`.
   - The project's Tailwind config defines `charcoal` as a custom CSS variable fallback (`var(--color-charcoal, #3a2d1d)`).
   - In Tailwind CSS, custom colors defined using hex values inside CSS variable wrappers do not support the alpha slash (`/opacity`) modifier natively. This compiles to invalid CSS (`rgba(#3a2d1d, 0.95)`), causing the browser to ignore the background color completely and leaving the backdrop transparent.

### The Resolution
1. **React Portal Escaping**:
   - Imported `createPortal` from `react-dom`.
   - Wrapped the entire `zoomedImage` lightbox overlay component block inside `createPortal(..., document.body)`.
   - This moves the lightbox overlay elements out of the `ItemDetail` DOM hierarchy, appending them directly under `document.body` where they escape all parent stacking contexts and overflow clipping.
2. **Standard Tailwind Opacity Backdrops**:
   - Replaced custom opacity classes (`bg-charcoal/95`, `bg-charcoal/60`, and `bg-charcoal/80`) with standard, high-contrast Tailwind colors (`bg-neutral-950/95`, `bg-neutral-900/60`, and `bg-neutral-900/80`).
   - This generates valid CSS, turning the backdrop into a beautiful semi-transparent dark mask that dims all background page components (including the sidebar and header) to highlight the zoomed image.

### Verification Results
1. **End-to-End Navigation Test**:
   - Navigated to `/archive`, loaded the first item card details `/items/whzizfHOZJEPX03FlZzY`, and clicked the main image.
   - **Status**: The zoom overlay renders on top of all page elements (including the sidebar and header) and covers the entire viewport.
2. **DOM Alignment**:
   - Verified that the overlay mounts directly under the `<body>` element with `z-index: 2000` and computed background color `rgba(10, 10, 10, 0.95)` (95% opacity dark backdrop).
3. **Event Interception**:
   - Verified that clicking the dimmed sidebar area successfully propagates to the lightbox background handler, closing the zoom view and returning the user to the item detail page without triggering unwanted navigation.

---

## 🔍 Scroll-Aware Unified Headroom Header

We successfully implemented a unified, scroll-direction-aware navigation header at the top of the main page content, keeping page headers and action buttons perfectly aligned and clear.

### The Resolution
1. **Scroll-Aware Hook**:
   - Integrated scroll detection into [Layout.tsx](src/components/Layout.tsx) using a standard window scroll listener.
   - When scrolling down, the header slides up cleanly (`-translate-y-full`) to expand the readable content area.
   - When scrolling up or remaining at the top of the page (`scrollY <= 10`), the header slides down smoothly (`translate-y-0`).
2. **Header Integration**:
   - Replaced both the mobile-only header and the desktop-only absolute floating log-in box with a single responsive header.
   - Styled the header to connect flush with the sidebar: `fixed top-0 left-0 md:left-72 right-0 h-16 bg-white/90 backdrop-blur-md border-b border-tan-light/30 z-[990]`.
   - Desktop layout features the wide user email and profile avatar widget.
   - Mobile layout scales down to a clean menu toggle icon, search scanner icon, and compact log-in icon button.
3. **Layout Clean-up**:
   - Restored standard container widths across all detail/edit pages by removing the temporary `md:pr-72` padding workarounds, as content now scrolls safely beneath the header.


