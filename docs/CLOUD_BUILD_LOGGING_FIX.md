# Cloud Build: Fix “No logs were found” (Permissions)

Cloud Build failed for Functions in **europe-west2**, but the Build log tab shows “No logs were found” because of permissions.

## 1. Let the build service account write logs

The default Compute Engine service account runs the build and must be able to write to Cloud Logging.

1. Open **IAM**: https://console.cloud.google.com/iam-admin/iam?project=driiva  
2. Find **894211619782-compute@developer.gserviceaccount.com** (or “Compute Engine default service account”).  
3. Click the pencil (Edit).  
4. **Add another role** → choose **Logs Writer** (`roles/logging.logWriter`).  
5. Save.

## 2. Let your user (or role) view logs

Your Google account needs permission to list log entries.

1. Same **IAM** page: https://console.cloud.google.com/iam-admin/iam?project=driiva  
2. Find your user (e.g. your email) or the role you use for the project.  
3. Edit → **Add another role** → **Logs Viewer** (`roles/logging.logViewer`).  
   - “Project Viewer” also includes `logging.logEntries.list`; if you already have that, you may only need the service account fix above.  
4. Save.

## 3. Retry a build and open logs

1. Go to **Cloud Build → History**: https://console.cloud.google.com/cloud-build/builds?project=894211619782  
2. Filter: **Region** = `europe-west2`, **Status** = `Failed`.  
3. Open a failed build → click **Retry build** (or trigger a new deploy with `firebase deploy --only functions`).  
4. When the build runs (and fails), open it again and go to the **Build log** tab; you should now see the real error at the bottom of the log.

## One-liner (if you use gcloud)

```bash
# Grant Logs Writer to the default Compute Engine service account
gcloud projects add-iam-policy-binding driiva \
  --member="serviceAccount:894211619782-compute@developer.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

Replace `driiva` with your project ID if different. For **viewing** logs, your user needs e.g. `roles/logging.logViewer` on the project (add via Console IAM or a similar `add-iam-policy-binding` for your user).

---

# Cloud Build: Fix “failed to create image cache” (Artifact Registry)

If the build log shows:

- **ERROR: failed to create image cache: accessing cache image 'europe-west2...'**
- **ERROR: build step 2 ... serverless-runtimes/...**

the build is failing because the Cloud Build service account cannot read/write the **Artifact Registry** repo used for the function image cache.

## Fix: Grant Artifact Registry access to the build service account

1. Open **IAM**: https://console.cloud.google.com/iam-admin/iam?project=driiva  
2. Find **894211619782-compute@developer.gserviceaccount.com** (Compute Engine default service account).  
3. Click the pencil (Edit).  
4. **Add another role** → **Artifact Registry Writer** (`roles/artifactregistry.writer`).  
5. Save.

If that principal is not in the list, click **Grant access**, add:
- **Principal:** `894211619782-compute@developer.gserviceaccount.com`  
- **Role:** **Artifact Registry Writer**  
then Save.

## Ensure Artifact Registry API is on

1. Open: https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=driiva  
2. If it says “Enable”, click **Enable**.  
3. (Cloud Build API should already be on; if not, enable it too.)

## Retry

Run again:

```bash
firebase deploy --only functions --force
```

or click **Retry build** on the failed build in the Cloud Build History.

## One-liner (gcloud)

```bash
gcloud projects add-iam-policy-binding driiva \
  --member="serviceAccount:894211619782-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```
