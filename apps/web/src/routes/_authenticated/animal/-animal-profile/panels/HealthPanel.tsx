import type { AnimalProfile } from "../types"
import { Panel, Badge } from "@/components/game/ui"
import { Stethoscope, ShieldCheck } from "lucide-react"

export function HealthPanel({ animal }: { animal: AnimalProfile }) {
  const activeConditions = animal.healthRecords.filter((r) => r.isActive)

  return (
    <Panel title="Health" icon={<Stethoscope className="size-4 text-destructive" />}>
      {activeConditions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No active conditions</p>
      ) : (
        <div className="space-y-1.5">
          {activeConditions.map((record: AnimalProfile["healthRecords"][number]) => (
            <div key={record.id} className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{record.conditionDef.name}</span>
                <Badge tone="danger">Active</Badge>
              </div>
              {record.treatmentRecords.map((t: AnimalProfile["healthRecords"][number]["treatmentRecords"][number]) => (
                <p key={t.id} className="mt-1 text-[11px] text-muted-foreground">
                  Treating: <span className="font-medium text-foreground">{t.treatmentDef.name}</span>
                  {t.activityRestriction && <span className="text-destructive"> · activity restricted</span>}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {animal.healthCertificates.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Certificates</h4>
          <div className="flex flex-wrap gap-1.5">
            {animal.healthCertificates.map((cert: AnimalProfile["healthCertificates"][number]) => (
              <span
                key={cert.id}
                className="inline-flex items-center gap-1 rounded-md border border-chart-2/30 bg-chart-2/10 px-2 py-1 text-[11px] font-medium text-chart-2"
              >
                <ShieldCheck className="size-3" /> {cert.certDef.name}
              </span>
            ))}
          </div>
        </>
      )}

      {animal.testResults.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Panel Tests</h4>
          <div className="space-y-1.5">
            {animal.testResults.map((t: AnimalProfile["testResults"][number]) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
              >
                <span className="text-xs font-semibold text-foreground">{t.conditionDef.name}</span>
                <Badge tone="success">Tested · {t.result}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
