Boss Employees Section Blank Screen Fix

Cause: EmployeesView.tsx used the <Trash2> icon but did not import Trash2 from lucide-react. This causes a ReferenceError when the employee table renders.

Only file changed:
src/components/employees/EmployeesView.tsx

No database migrations, credential changes, or backend modifications required.

In VS Code PowerShell terminal, inside your existing GitHub clone:

cd "C:\Users\User\One-Tap-Attendance-Boss-"
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_Employees_Blank_Fix.zip" -DestinationPath . -Force
git add src/components/employees/EmployeesView.tsx
git commit -m "Fix blank employee section missing Trash2 import"
git push origin main

After Cloudflare reports a successful deployment, open Boss and refresh. Existing attendance and employee records are not modified by this frontend-only patch.
