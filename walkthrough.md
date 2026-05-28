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
