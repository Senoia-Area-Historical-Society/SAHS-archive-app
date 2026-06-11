# Implementation Plan: Personal Map Pins (Private Spatial Annotations)

This plan outlines the design and implementation steps to allow members to drop private, custom map pins on their geographic maps that are **strictly visible only to themselves**.

---

## User Review Required

> [!IMPORTANT]
> **Strict Privacy Controls**: To guarantee that these custom pins are private and only visible to the dropping researcher, we will implement:
> 1. A dedicated **`personal_pins`** collection in Firestore where each pin document includes an `ownerEmail` field.
> 2. Strict **Firestore Security Rules** allowing read, write, update, and delete access *only* if the logged-in user's email matches the `ownerEmail` field of the pin.
> 3. Clean local loading of personal pins in the UI restricted specifically to the active logged-in user.

> [!NOTE]
> **Map Pin-Dropping UX**:
> - We will introduce a **"📌 Drop Pin Mode"** toggle button overlaying the map canvas.
> - When turned ON:
>   - The map cursor changes to a `crosshair` to indicate active targeting.
>   - A floating banner appears: *"📍 Click anywhere on the map to drop a personal pin."*
>   - Clicking the map opens a beautifully styled modal to record the Pin Title, Description, Historical Date, and Address.
> - Once saved, the pin is stored, loaded instantly, and "Drop Pin Mode" turns off automatically to prevent accidental clicks.

---

## Proposed Changes

### 1. Database & Security

#### [MODIFY] [firestore.rules](file:///\\wsl.localhost\Ubuntu\home\catnolan\SAHS-archive-app\firestore.rules)
Add explicit security rules for the new `personal_pins` collection to enforce absolute private ownership:
```firestore
    // Root-level personal_pins: Only the owner (matching ownerEmail) can read/write their personal pins
    match /personal_pins/{pinId} {
      allow read: if request.auth != null && resource.data.ownerEmail.lower() == request.auth.token.email.lower();
      allow create: if request.auth != null && request.resource.data.ownerEmail.lower() == request.auth.token.email.lower();
      allow update: if request.auth != null && resource.data.ownerEmail.lower() == request.auth.token.email.lower() && request.resource.data.ownerEmail.lower() == request.auth.token.email.lower();
      allow delete: if request.auth != null && resource.data.ownerEmail.lower() == request.auth.token.email.lower();
    }
```

---

### 2. Frontend React Components

#### [MODIFY] [FolderMapView.tsx](file:///\\wsl.localhost\Ubuntu\home\catnolan\SAHS-archive-app\src\components\FolderMapView.tsx)

1. **State & Effect Extensions**:
   - `personalPins`: Array of `PersonalPin` documents.
   - `isDropPinMode`: Boolean toggled by map overlays.
   - `clickedLocation`: `{ lat: number, lng: number } | null` storing the active clicked coordinates.
   - Form inputs: `pinTitle`, `pinDescription`, `pinDate`, `pinAddress`.
   - Effect: Load pins where `ownerEmail == user.email` from Firestore on component mount and refresh.

2. **React Leaflet MapEventsHandler**:
   - Implement a nested subcomponent that registers Leaflet map click events dynamically when `isDropPinMode` is active.

3. **Custom Marker Design & Animations**:
   - Build a custom crimson pin div icon styled with a subtle retro drop-shadow and bounce animation to make personal pins visually distinct from database archive items.

4. **Split-Screen Sidebar Integration**:
   - Add a new **"📌 Personal Research Pins"** section in the sidebar.
   - Display each pin with its title, coordinates/address, description, and a direct **"Delete"** button to allow instant management.
   - Integrate the **"Locate"** pan-and-popup functionality so that personal pins can be selected and navigated smoothly, matching the native experience.

5. **Pin Creation Modal Form**:
   - A highly polished cream-and-tan heritage-styled form dialog asking for Title, Description, and optional details.

---

## Verification Plan

### Local Host Preview & Tests
1. **Drop Pin Trigger**:
   - Start the local server at `http://localhost:5175/`.
   - Open **"My Research Map"** or a folder map view.
   - Toggle **"Drop Pin Mode"** and click on a spot in Senoia.
   - Verify that the **"Drop Personal Pin"** modal opens with coordinates pre-filled.
2. **Saving & Plotting**:
   - Complete the form and click save.
   - Verify the custom crimson pin bounces onto the map and is added to the sidebar under **"Personal Research Pins"**.
3. **Smooth Pan & Popup**:
   - Click the personal pin in the sidebar and check that the map smoothly glides to center on it and opens its popover details.
4. **Access Verification (Privacy)**:
   - Verify in a different browser/test account that other users CANNOT see or access your personal research pins, conforming to the absolute privacy specification.
