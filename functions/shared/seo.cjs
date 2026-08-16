/**
 * GENERATED FILE - DO NOT EDIT.
 * Bundled from src/lib/seo.ts and src/lib/structuredData.ts by
 * scripts/prepare-functions.cjs. Edit those sources instead.
 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  DEFAULT_DESCRIPTION: () => DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE: () => DEFAULT_OG_IMAGE,
  DEFAULT_SITE_NAME: () => DEFAULT_SITE_NAME,
  SITE_URL: () => SITE_URL,
  absoluteUrl: () => absoluteUrl,
  buildBookJsonLd: () => buildBookJsonLd,
  buildBookSeo: () => buildBookSeo,
  buildBreadcrumbJsonLd: () => buildBreadcrumbJsonLd,
  buildCollectionJsonLd: () => buildCollectionJsonLd,
  buildCollectionSeo: () => buildCollectionSeo,
  buildItemJsonLd: () => buildItemJsonLd,
  buildItemSeo: () => buildItemSeo,
  buildOrganizationJsonLd: () => buildOrganizationJsonLd,
  buildPageSeo: () => buildPageSeo,
  buildWebSiteJsonLd: () => buildWebSiteJsonLd,
  describeItem: () => describeItem,
  formatTitle: () => formatTitle,
  truncate: () => truncate
});
module.exports = __toCommonJS(stdin_exports);

// src/lib/seo.ts
var SITE_URL = "https://archives.senoiahistory.com";
var DEFAULT_SITE_NAME = "Senoia Area Historical Society";
var DEFAULT_DESCRIPTION = "Explore the Senoia Area Historical Society's digital archive: photographs, documents, oral histories, and artifacts documenting the history of Senoia and Coweta County, Georgia.";
var DEFAULT_OG_IMAGE = `${SITE_URL}/home-street-view.jpg`;
var DESCRIPTION_MAX = 155;
var TITLE_MAX = 60;
function truncate(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}
function absoluteUrl(path) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
function formatTitle(pageTitle, siteName) {
  if (!pageTitle || pageTitle.trim() === "") return siteName;
  return `${truncate(pageTitle, TITLE_MAX)} | ${siteName}`;
}
function firstNonEmpty(...values) {
  for (const value of values) {
    if (value && value.trim() !== "") return value.trim();
  }
  return void 0;
}
function describeItem(item) {
  const described = firstNonEmpty(item.description, item.transcription);
  if (described) return truncate(described, DESCRIPTION_MAX);
  const parts = [
    firstNonEmpty(item.item_type, "Item"),
    item.date ? `dated ${item.date}` : void 0,
    item.creator ? `by ${item.creator}` : void 0,
    item.historical_address ? `at ${item.historical_address}` : void 0
  ].filter(Boolean);
  return truncate(
    `${parts.join(" ")} from the ${DEFAULT_SITE_NAME} archive.`,
    DESCRIPTION_MAX
  );
}
function buildItemSeo(item, siteName = DEFAULT_SITE_NAME) {
  const name = firstNonEmpty(item.title, item.full_name, item.org_name) ?? "Archive Item";
  return {
    title: formatTitle(name, siteName),
    description: describeItem(item),
    canonical: item.id ? absoluteUrl(`/items/${item.id}`) : void 0,
    image: firstNonEmpty(item.featured_image_url, item.file_urls?.[0]) ?? DEFAULT_OG_IMAGE,
    type: "article",
    // Private items are readable only by staff; keep them out of the index.
    noindex: item.is_private === true
  };
}
function buildCollectionSeo(collection, siteName = DEFAULT_SITE_NAME) {
  const name = firstNonEmpty(collection.title) ?? "Collection";
  const count = collection.item_count;
  const description = firstNonEmpty(collection.description) ?? `${name} \u2014 a curated collection${count ? ` of ${count} items` : ""} in the ${siteName} digital archive.`;
  return {
    title: formatTitle(name, siteName),
    description: truncate(description, DESCRIPTION_MAX),
    canonical: collection.id ? absoluteUrl(`/collections/${collection.id}`) : void 0,
    image: firstNonEmpty(collection.featured_image_url) ?? DEFAULT_OG_IMAGE,
    type: "website",
    noindex: collection.is_private === true
  };
}
function buildBookSeo(book, siteName = DEFAULT_SITE_NAME) {
  const name = firstNonEmpty(book.title) ?? "Library Book";
  const authors = book.authors?.filter(Boolean).join(", ");
  const description = firstNonEmpty(book.description) ?? [
    name,
    authors ? `by ${authors}` : void 0,
    book.publish_year ? `(${book.publish_year})` : void 0,
    `\u2014 from the ${siteName} reference library.`
  ].filter(Boolean).join(" ");
  return {
    title: formatTitle(name, siteName),
    description: truncate(description, DESCRIPTION_MAX),
    canonical: book.id ? absoluteUrl(`/library/${book.id}`) : void 0,
    image: firstNonEmpty(book.cover_image_url) ?? DEFAULT_OG_IMAGE,
    type: "article"
  };
}
function buildPageSeo(pageTitle, description, path, siteName = DEFAULT_SITE_NAME) {
  return {
    title: formatTitle(pageTitle, siteName),
    description: truncate(description, DESCRIPTION_MAX),
    canonical: absoluteUrl(path),
    type: "website",
    image: DEFAULT_OG_IMAGE
  };
}

// src/lib/structuredData.ts
function toSchemaDate(value) {
  if (!value) return void 0;
  const raw = value.trim();
  if (raw === "") return void 0;
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return void 0;
  }
  const year = raw.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  return year ? year[1] : void 0;
}
function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === void 0) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}
function schemaTypeFor(itemType, artifactType) {
  switch (itemType) {
    case "Historic Figure":
      return "Person";
    case "Historic Organization":
      return "Organization";
    case "Oral History":
      return "AudioObject";
    case "Document":
      return /photo/i.test(artifactType || "") ? "Photograph" : "CreativeWork";
    case "Artifact":
      return /photo/i.test(artifactType || "") ? "Photograph" : "CreativeWork";
    default:
      return "CreativeWork";
  }
}
function publisherRef(siteName) {
  return {
    "@type": "Organization",
    name: siteName,
    url: SITE_URL
  };
}
function buildOrganizationJsonLd(siteName = DEFAULT_SITE_NAME) {
  return {
    "@context": "https://schema.org",
    "@type": "Museum",
    name: siteName,
    url: SITE_URL,
    logo: `${SITE_URL}/logo2.png`,
    description: "The Senoia Area Historical Society preserves and shares the history of Senoia and Coweta County, Georgia through a digital archive of photographs, documents, artifacts and oral histories.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Senoia",
      addressRegion: "GA",
      addressCountry: "US"
    }
  };
}
function buildWebSiteJsonLd(siteName = DEFAULT_SITE_NAME) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: `${siteName} Digital Archive`,
    url: SITE_URL,
    publisher: publisherRef(siteName)
  };
}
function buildBreadcrumbJsonLd(crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path)
    }))
  };
}
function buildItemJsonLd(item, siteName = DEFAULT_SITE_NAME) {
  const type = schemaTypeFor(item.item_type, item.artifact_type);
  const url = item.id ? absoluteUrl(`/items/${item.id}`) : void 0;
  const image = item.featured_image_url || item.file_urls?.[0];
  const keywords = [item.subject, ...item.tags || []].filter((k) => typeof k === "string" && k.trim() !== "").join(", ");
  const base = {
    "@context": "https://schema.org",
    "@type": type,
    name: item.title,
    description: describeItem(item),
    url,
    image,
    identifier: item.archive_reference || item.identifier,
    keywords,
    isPartOf: {
      "@type": "Collection",
      name: `${siteName} Digital Archive`,
      url: SITE_URL
    }
  };
  if (type === "Person") {
    return compact({
      ...base,
      name: item.full_name || item.title,
      alternateName: item.also_known_as,
      birthDate: toSchemaDate(item.birth_date),
      deathDate: toSchemaDate(item.death_date),
      birthPlace: item.birthplace,
      jobTitle: item.occupation,
      // Person has no publisher/dateCreated; those belong to the record.
      publisher: void 0
    });
  }
  if (type === "Organization") {
    return compact({
      ...base,
      name: item.org_name || item.title,
      alternateName: item.alternative_names,
      foundingDate: toSchemaDate(item.founding_date),
      dissolutionDate: toSchemaDate(item.dissolved_date)
    });
  }
  return compact({
    ...base,
    creator: item.creator ? { "@type": "Person", name: item.creator } : void 0,
    dateCreated: toSchemaDate(item.date),
    contentLocation: item.historical_address ? { "@type": "Place", name: item.historical_address } : void 0,
    license: item.rights,
    inLanguage: item.language || "en",
    material: item.format,
    publisher: publisherRef(siteName),
    text: item.transcription || void 0
  });
}
function buildCollectionJsonLd(collection, siteName = DEFAULT_SITE_NAME) {
  return compact({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.title,
    description: collection.description,
    url: collection.id ? absoluteUrl(`/collections/${collection.id}`) : void 0,
    image: collection.featured_image_url,
    publisher: publisherRef(siteName)
  });
}
function buildBookJsonLd(book, siteName = DEFAULT_SITE_NAME) {
  const authors = (book.authors || []).filter(Boolean);
  return compact({
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    description: book.description,
    url: book.id ? absoluteUrl(`/library/${book.id}`) : void 0,
    image: book.cover_image_url,
    author: authors.length ? authors.map((name) => ({ "@type": "Person", name })) : void 0,
    publisher: book.publisher ? { "@type": "Organization", name: book.publisher } : void 0,
    datePublished: toSchemaDate(
      book.publish_year != null ? String(book.publish_year) : void 0
    ),
    isbn: book.isbn,
    about: book.subjects,
    // The physical shelf reference within the reference library.
    identifier: book.call_number || book.accession_number,
    inLanguage: "en",
    isPartOf: {
      "@type": "Collection",
      name: `${siteName} Reference Library`,
      url: `${SITE_URL}/library`
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_SITE_NAME,
  SITE_URL,
  absoluteUrl,
  buildBookJsonLd,
  buildBookSeo,
  buildBreadcrumbJsonLd,
  buildCollectionJsonLd,
  buildCollectionSeo,
  buildItemJsonLd,
  buildItemSeo,
  buildOrganizationJsonLd,
  buildPageSeo,
  buildWebSiteJsonLd,
  describeItem,
  formatTitle,
  truncate
});
