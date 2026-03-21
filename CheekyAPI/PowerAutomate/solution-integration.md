Integration notes for Cheeky_CreateTasks and Cheeky_ProductionTracker templates

Overview
- The deploy script (deploy-cheeky-solution.ps1) will unpack the CheekyTeesAutomation solution zip, search for a flows/workflows folder and copy the template JSON files into it before re-packing and importing the solution.

Before importing into Dataverse (recommended steps):
1. Open each template JSON in the Power Automate designer and convert the Request trigger into a solution child flow trigger (Instant cloud flow > Child flow).
2. Replace placeholder logical names with your environment's logical names:
   - Order lookup binding: '/orders({OrderId})' may need the correct schema name (e.g., /new_orders({id})).
   - Field names used: taskid, taskorder, scheduledend, status, new_order, new_taskname, new_status, new_timestamp, new_user, new_notes. Replace with actual logical names used in your Dataverse.
3. Make the flows solution-aware and add them to the CheekyTeesAutomation solution using the Power Automate UI or by placing the exported flow definitions into the solution folder structure.
4. Set Run-Only users and connection references for the flows (Dataverse connector) to use a service account with least privilege.

Automated deployment behavior
- The deployment script will try to authenticate (interactive or service principal), unpack the solution zip, copy templates from CheekyAPI/PowerAutomate to the solution's Workflows folder (or create it), re-pack, import, and publish.
- After import you should open the flows in the solution, ensure connection references are set, and convert the Request trigger into a child flow trigger if necessary.

Notes
- Power Platform expects a specific folder structure inside solution packages. If the simple copy into 'Workflows' does not attach the flows to the solution on import, follow the manual steps in the "Before importing" section.
- Always test deployments in a non-production environment first.
