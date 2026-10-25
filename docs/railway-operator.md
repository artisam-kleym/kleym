# Turning Kleym Testnet off and on

Checked October 9, 2026 (Asia/Manila). This procedure pauses the existing deployment; it does not install a new Kleym release.

## Open the correct environment

Open [kleym-testnet in Railway](https://railway.com/project/48614d0d-2e58-4848-af96-2184e3044c47), then select **testnet** in the environment selector. The separate **production** environment is not the running Kleym app.

The four running services are **kleym-web**, **kleym-worker**, **Postgres**, and **Redis**. The older **kleym-testnet** service is not part of the current running stack.

## Turn off

1. Finish any funding, claim or reclaim already awaiting confirmation. Save the private campaign CSV and recovery phrase before closing its creation tab.
2. Open **kleym-web → Deployments**. On the active deployment, open **⋯ → Remove**, then confirm. This removes the running deployment, not the service definition.
3. Repeat for **kleym-worker**. Wait until both deployments show **Removed**.
4. Repeat for **Redis**, then **Postgres**, if you want all four services stopped.
5. Confirm none of the four services has an active deployment. The public Kleym website will be unavailable.

Use the deployment menu. Do not choose Delete service, Delete project, or Delete volume. Retain database volumes, variables and domain settings.

Stopping only the web service leaves the worker and databases running and consuming resources. Stopping the whole stack also pauses Kleym's reconciliation and queue processing. Existing Stellar balances remain on the ledger, and campaign expiry continues while Kleym is offline. Turn the app back on to claim or reclaim through its interface; shutdown does not automatically return funds.

## Turn on

1. Open **Postgres → Deployments** and use **⋯ → Redeploy** on its retained known-good deployment. Do the same for **Redis**. Wait for both to reach **Success**.
2. Redeploy the retained known-good **kleym-worker** deployment; wait for **Success**.
3. Redeploy the latest qualified **kleym-web** deployment; wait for **Success**.
4. Open [readiness](https://kleym-web-testnet.up.railway.app/api/ready): it should report `ready: true`. Check the [status page](https://kleym-web-testnet.up.railway.app/status), then [sign in](https://kleym-web-testnet.up.railway.app/login).
5. Confirm your existing campaign is still present before creating or signing anything else.

Choose **Redeploy** to reuse the retained release. **Deploy Latest Commit**, changing database image tags, reseeding or recreating services is a different operation. If Railway no longer offers the retained deployment or reports expired credit, resolve that provider/account condition rather than resetting the database.

## Costs and account lifetime

Removing running deployments stops their compute usage. Retained volume storage can still be charged. The trial calendar continues: stopping services does not freeze the 30-day credit expiry. Railway states that Trial-created volumes are deleted 30 days after credits expire. Keep private backups and check your workspace billing page before leaving the project unused for a long period.

There is no Railway-style application process to stop in the WalletConnect/Reown project. Keep its public Project ID and allowed origin configured so phone connections work when Kleym returns. Its plan/usage limits are separate from Railway's credits.

## References

- [Railway deployment actions](https://docs.railway.com/deployments/deployment-actions)
- [Railway usage pricing](https://docs.railway.com/pricing/plans#resource-usage-pricing)
- [Railway trial and data retention](https://docs.railway.com/pricing/free-trial)

