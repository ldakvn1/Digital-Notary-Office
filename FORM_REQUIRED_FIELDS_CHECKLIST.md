# Form Required Fields Checklist

Use this quick checklist during implementation and review of any form.

## Rule

- If a field is validated as required in logic/API (`if (!value)`, validation schema, or backend requirement), the UI control must show `required` (`*`).
- If a field is optional in logic/API, do not show `*`.
- Conditional required fields must only show `*` when the condition is active.

## Review Checklist

- Required validation exists in submit handler and/or API contract.
- Matching UI input has `required` (TextField/FormControl/InputLabel).
- Error/warning message text matches the required field label.
- Optional fields do not show `*`.
- Create and Edit modes are consistent with business rule (for example, required only in create mode).

## Current Project Notes

- User Management: `Email` is required in create mode because the account info is sent via email.
- Keep `required={!editingUser}` on the email input in User Management.
