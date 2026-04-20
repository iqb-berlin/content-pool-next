# ACP Workflows

## Overview

Most product functionality is organized around the ACP lifecycle. This guide explains how
an ACP typically moves through the system from creation to viewing, review, and export.

## 1. Create the ACP

An app admin creates an ACP through the ACP management API or admin UI.

Core fields:

- `packageId`
- `name`
- `description`

At this stage the ACP exists, but it usually still needs:

- an ACP index,
- files,
- access configuration review,
- role assignments.

New ACPs are created with a default access configuration of `PRIVATE`, so they are not
publicly visible until a manager changes that setting.

## 2. Configure Access

Before sharing the ACP, managers define how it should be exposed.

Typical choices:

- private setup while managers prepare content,
- public preview for open content,
- role-based access for known internal users,
- ACP credential list for tightly scoped review access.

This same step also controls feature flags such as:

- whether files can be downloaded,
- whether the item list is visible,
- whether commenting is allowed,
- which comment targets are valid,
- whether user preferences should persist.

## 3. Assign Roles

Role assignment happens separately from the access model.

Typical patterns:

- app admin assigns `ACP_MANAGER` to project maintainers,
- managers or admins assign `READ_ONLY` to internal reviewers,
- credential viewers are handled through the credential list rather than ACP role assignment.

Important rule:

- non-admin managers can assign `READ_ONLY`, but only app admins can assign or remove `ACP_MANAGER`.

## 4. Build or Import the ACP Index

The ACP index is the main structured content payload. Managers can:

- fetch it,
- update it directly,
- import a full replacement JSON payload,
- reset it,
- export it as JSON.

This index drives:

- start-page information,
- unit and sequence navigation,
- many read-only view structures,
- semantic validation cross-references.

## 5. Upload Files

Managers upload files through the file-management endpoints or UI.

The backend then performs follow-up work automatically:

1. file metadata is persisted,
2. the ACP index can be synchronized from uploaded files,
3. syntactic validation runs per file,
4. semantic ACP-wide validation runs across index and file references.

Conflict strategies currently supported on upload:

- `reject`
- `overwrite`
- `keep-both`

## 6. Validate Content

The file and validation subsystems help managers answer several practical questions:

- are required files present for each unit,
- are JSON payloads syntactically valid,
- do referenced files exist,
- do index references point to real units or dependencies,
- is the current ACP internally consistent.

Validation feedback is stored with file metadata so the UI can surface the result later.

## 7. Explore and Refine Item Data

Once content is loaded, the item workflows become relevant:

- browse item lists,
- filter and sort by metadata,
- manage shared tags,
- import empirical difficulties,
- edit explorer draft state,
- persist viewer preferences if enabled.

For collaborative metadata curation, the Item Explorer is the main UI. It is documented in
[Item Explorer](item-explorer.md).

## 8. Create Snapshots

Snapshots are the rollback and comparison mechanism for ACPs.

Managers should create a snapshot:

- before a major index import,
- before large file replacement work,
- before publishing important item explorer changes,
- before external transfer operations that may be hard to undo.

Snapshots support:

- list,
- detail,
- diff against previous snapshot,
- diff against current state,
- restore,
- delete.

## 9. Run Read-Only Review

Once an ACP is stable enough for review, users can work through the view-side routes:

- start page,
- units,
- task sequences,
- item list,
- item explorer,
- item detail,
- ACP index.

Exactly what appears depends on:

- access model,
- feature flags,
- user role,
- whether the session is anonymous, user-based, or credential-based.

## 10. Collect Comments

Comments can target:

- units,
- items,
- task sequences.

Commenting is controlled by ACP feature flags. Managers can export comments as:

- JSON
- XLSX

Non-manager users can export only the subset they are allowed to see.

## 11. Export or Integrate

When an ACP is ready for handoff or synchronization, there are several export paths:

- ACP index JSON export,
- file download and ZIP export,
- full ACP transfer through the server API,
- coding-scheme replacement through the server API for managed update workflows.

## Practical Manager Checklist

When setting up a new ACP, a good sequence is:

1. create the ACP,
2. set access model and feature flags,
3. assign manager roles,
4. import or initialize the ACP index,
5. upload files,
6. review validation output,
7. adjust metadata columns and tags,
8. create a snapshot,
9. test the read-only view as the intended audience,
10. export or share access.

## Related Documents

- [Access Control](access-control.md)
- [Item Explorer](item-explorer.md)
- [Integrations and API](integrations-and-api.md)
