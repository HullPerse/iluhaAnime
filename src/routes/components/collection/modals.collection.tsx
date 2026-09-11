import { ConfirmDialog } from "@/components/shared/confirm.component";
import { SelectDialog } from "@/components/shared/selectDialog.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type {
  CollectionItem,
  CollectionStatusDef,
  CustomFieldDef,
  WizardPrefill,
} from "@/types/collection";

import { DetailCollection } from "./detail/modal.detail";
import ImportAnilistCollection from "./importAnilist.collection";
import { StatusManagerCollection } from "./statusManager.collection";
import { WizardModal } from "./wizard/modal.wizard";

export default function CollectionModals({
  showWizard,
  editingItem,
  wizardDraft,
  statuses,
  customFieldDefs,
  anilistImport,
  detailItem,
  items,
  pendingDelete,
  statusManager,
  showImportStrategy,
  onWizardClose,
  onWizardSave,
  onWizardDelete,
  onImportClose,
  onDetailClose,
  onOpenItem,
  onDetailEdit,
  onDetailDelete,
  refreshMetadata,
  onConfirmDelete,
  onCancelDelete,
  onConfirmImport,
  onCloseImport,
  onUpsertStatus,
  onDeleteStatus,
  onStatusManagerClose,
}: {
  showWizard: boolean;
  editingItem: CollectionItem | null;
  wizardDraft: WizardPrefill | null;
  statuses: CollectionStatusDef[];
  customFieldDefs: CustomFieldDef[];
  anilistImport: boolean;
  detailItem: CollectionItem | null;
  items: CollectionItem[];
  pendingDelete: string | null;
  statusManager: boolean;
  showImportStrategy: boolean;
  onWizardClose: () => void;
  onWizardSave: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) => void;
  onWizardDelete: (id: string) => void;
  onImportClose: () => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
  onDetailClose: () => void;
  onOpenItem: (item: CollectionItem) => void;
  onDetailEdit: (item: CollectionItem) => void;
  onDetailDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onConfirmImport: (value: string) => void;
  onCloseImport: () => void;
  onUpsertStatus: (status: CollectionStatusDef) => void;
  onDeleteStatus: (id: string) => void;
  onStatusManagerClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      {showWizard && (
        <WizardModal
          open={showWizard}
          onClose={onWizardClose}
          onSave={onWizardSave}
          onDelete={onWizardDelete}
          initial={editingItem}
          prefill={wizardDraft}
          statuses={statuses}
          customFieldDefs={customFieldDefs}
        />
      )}
      {anilistImport && (
        <ImportAnilistCollection
          open={anilistImport}
          onClose={onImportClose}
          onImported={() => {}}
        />
      )}

      {detailItem && (
        <DetailCollection
          item={detailItem}
          items={items}
          statuses={statuses}
          onClose={onDetailClose}
          onOpenItem={onOpenItem}
          onEdit={onDetailEdit}
          onDelete={onDetailDelete}
          refreshMetadata={refreshMetadata}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("collection.delete.media.title")}
          message={t("collection.delete.media.message")}
          confirmLabel={t("common.delete")}
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
          onClose={onCancelDelete}
        />
      )}
      {showImportStrategy && (
        <SelectDialog
          header={t("collection.import.title")}
          label={t("collection.import.overwrite.confirm")}
          options={[
            { value: "overwrite", label: t("collection.import.overwrite") },
            { value: "skip", label: t("collection.import.skip") },
          ]}
          onSubmit={onConfirmImport}
          onClose={onCloseImport}
        />
      )}
      {statusManager && (
        <StatusManagerCollection
          statuses={statuses}
          onUpsert={onUpsertStatus}
          onDelete={onDeleteStatus}
          onClose={onStatusManagerClose}
        />
      )}
    </>
  );
}
