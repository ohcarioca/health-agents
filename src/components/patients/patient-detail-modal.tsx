"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { PatientInfoTab } from "@/components/patients/patient-info-tab";
import { PatientAppointmentsTab } from "@/components/patients/patient-appointments-tab";
import { PatientPaymentsTab } from "@/components/patients/patient-payments-tab";
import { PatientFilesTab } from "@/components/patients/patient-files-tab";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import type { CustomFieldDefinition } from "@/types";

interface PatientDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string | null;
  onPatientUpdated: () => void;
  onCustomFieldCreated?: (field: CustomFieldDefinition) => void;
}

interface PatientData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  date_of_birth: string | null;
  notes: string | null;
  custom_fields: Record<string, string>;
  last_visit_at: string | null;
  created_at: string;
}

const TAB_KEYS = ["tabInfo", "tabAppointments", "tabPayments", "tabFiles"] as const;

export function PatientDetailModal({
  open,
  onOpenChange,
  patientId,
  onPatientUpdated,
  onCustomFieldCreated,
}: PatientDetailModalProps) {
  const t = useTranslations("patients.detail");
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState(0);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const fetchPatient = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/patients/${patientId}`);
      if (res.ok) {
        const json = await res.json();
        setPatient(json.data.patient);
        setCustomFieldDefs(json.data.customFieldDefinitions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open && patientId) {
      setActiveTab(0);
      setPatient(null);
      fetchPatient();
    }
  }, [open, patientId, fetchPatient]);

  function handleEditSuccess() {
    setEditOpen(false);
    fetchPatient();
    onPatientUpdated();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={patient?.name ?? t("title")}
        size="xl"
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : patient ? (
          <div className="space-y-4">
            {/* Tab bar */}
            <div
              className="flex gap-1 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              {TAB_KEYS.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    i === activeTab
                      ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                  style={
                    i === activeTab
                      ? { marginBottom: "-1px" }
                      : undefined
                  }
                >
                  {t(tab)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 0 && (
              <PatientInfoTab
                patient={patient}
                customFieldDefs={customFieldDefs}
                locale={locale}
                onEdit={() => setEditOpen(true)}
              />
            )}
            {activeTab === 1 && (
              <PatientAppointmentsTab patientId={patient.id} locale={locale} />
            )}
            {activeTab === 2 && (
              <PatientPaymentsTab patientId={patient.id} locale={locale} />
            )}
            {activeTab === 3 && (
              <PatientFilesTab patientId={patient.id} />
            )}
          </div>
        ) : null}
      </Dialog>

      {patient && (
        <PatientFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          patient={{
            id: patient.id,
            name: patient.name,
            phone: patient.phone,
            email: patient.email,
            cpf: patient.cpf,
            date_of_birth: patient.date_of_birth,
            notes: patient.notes,
            custom_fields: patient.custom_fields,
          }}
          customFields={customFieldDefs}
          onSuccess={handleEditSuccess}
          onCustomFieldCreated={onCustomFieldCreated}
        />
      )}
    </>
  );
}
