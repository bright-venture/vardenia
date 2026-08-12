# Where uploaded photos live

By default they are written to disk under `apps/web/public/media`. That is fine on your
laptop and **wrong everywhere else**: hosting platforms replace the filesystem on every
release, so uploads vanish the next time you deploy. A magazine that loses its photography
on a routine deploy is not a magazine.

This switches storage to a Supabase bucket. Ten minutes, once.

---

## 1. Create the bucket

Supabase dashboard, **Storage**, **New bucket**.

- Name: `media`
- **Public bucket: on**

Public matters. Every image here is meant to be seen by readers, and a public bucket means
browsers fetch photos straight from Supabase's CDN instead of through the app. Nothing
private is ever uploaded to this bucket, so there is no secret to protect. If that ever
changes, it needs a second, private bucket rather than locking this one.

## 2. Get S3 credentials

**Storage, then S3 connection** (it may be under Project Settings depending on your
dashboard version). You need three things:

- the **endpoint**, which looks like `https://<ref>.supabase.co/storage/v1/s3`
- the **region**, which is your project region, `eu-central-1` for Frankfurt
- an **access key** and **secret**, created with "New access key"

Save the secret when it appears. It is shown once.

## 3. Fill in `.env`

```
MEDIA_STORAGE_ADAPTER=s3
S3_BUCKET=media
S3_REGION=eu-central-1
S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Set the region to the real one. `auto` works for Cloudflare R2 but not for Supabase.

Restart the dev server. Anything uploaded from now on goes to the bucket.

## 4. Re-upload what you already have

Files uploaded while the adapter was `local` are still on disk and are **not** in the
bucket, so they will break. With a handful of test images the quickest fix is to delete
them in Media and upload again.

Once you have real photography this stops being acceptable, which is the argument for
switching before the library grows rather than after.

---

## Two details that will otherwise cost you an afternoon

**Path-style addressing.** Supabase addresses buckets by path, not by subdomain. The config
sets `forcePathStyle: true`; without it the SDK builds `https://media.<ref>.supabase.co/...`
and every upload fails.

**Two URLs for the same file.** Supabase exposes the bucket at two paths:

| Path                            | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `/storage/v1/s3/...`            | The authenticated S3 API. What the upload SDK talks to |
| `/storage/v1/object/public/...` | Anonymous read. What a browser needs                   |

Handing the S3 path to an `<img>` tag returns 400. `payload.config.ts` derives the public
URL from the endpoint automatically, so there is no second variable to set and nothing to
keep in sync.

## Going back to local

Set `MEDIA_STORAGE_ADAPTER=local`. Files already in the bucket stay there and their URLs
keep working, since they are absolute. Only new uploads change destination.

## Using Cloudflare R2 or AWS S3 instead

The same five variables work. Point `S3_ENDPOINT` at that provider and the public base URL
is used as given, since the Supabase path rewrite only applies to a Supabase endpoint. Add
the host to `images.remotePatterns` in `next.config.mjs` or `next/image` will refuse to
load from it.
