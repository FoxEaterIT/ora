import ExcelJS from "exceljs";
import { zipSync } from "fflate";

export function uniqueBackupSheetName(name: string, used: Set<string>, fallback: string) {
  const base = name.replace(/[\\/*?:[\]]/g, "-").trim().slice(0, 31) || fallback;
  let result = base;
  let suffixIndex = 2;
  while (used.has(result.toLocaleLowerCase())) {
    const suffix = ` (${suffixIndex++})`;
    result = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(result.toLocaleLowerCase());
  return result;
}

type PersonRef = { id: string; name: string; email: string };
type ProjectRef = { id: string; name: string };
type Entry = { id: string; user: PersonRef; project?: ProjectRef; description: string; start: Date; end: Date | null };
type Entity = { name: string; metadata: Array<[string, string | boolean]>; entries: Entry[] };
type BackupData = {
  projects: Array<{ id: string; name: string; description: string; color: string; archived: boolean; team: { id: string; name: string } | null; entries: Entry[] }>;
  people: Array<{ id: string; name: string; email: string; role: string; deactivatedAt: Date | null; entries: Array<Omit<Entry, "user"> & { project: ProjectRef }> }>;
  teams: Array<{ id: string; name: string; description: string; color: string; members: Array<{ user: PersonRef }>; projects: Array<{ id: string; name: string; entries: Entry[] }> }>;
};

function makeWorkbook(entities: Entity[], fallback: string) {
  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const entity of entities) {
    const metadataSheet = workbook.addWorksheet(uniqueBackupSheetName(entity.name, used, fallback));
    metadataSheet.columns = [{ header: "Field", key: "field", width: 26 }, { header: "Value", key: "value", width: 60 }];
    metadataSheet.addRows(entity.metadata.map(([field, value]) => ({ field, value: String(value) })));
    metadataSheet.getRow(1).font = { bold: true };

    const entriesSheet = workbook.addWorksheet(uniqueBackupSheetName(`${entity.name} entries`, used, "Entries"));
    entriesSheet.columns = [
      { header: "Entry ID", key: "id", width: 28 }, { header: "Person ID", key: "userId", width: 28 },
      { header: "Person", key: "user", width: 24 }, { header: "Email", key: "email", width: 30 },
      { header: "Project ID", key: "projectId", width: 28 }, { header: "Project", key: "project", width: 28 },
      { header: "Activity", key: "description", width: 40 }, { header: "Start", key: "start", width: 24 }, { header: "End", key: "end", width: 24 },
    ];
    for (const entry of entity.entries) entriesSheet.addRow({ id: entry.id, userId: entry.user.id, user: entry.user.name, email: entry.user.email, projectId: entry.project?.id ?? "", project: entry.project?.name ?? "", description: entry.description, start: entry.start.toISOString(), end: entry.end?.toISOString() ?? "" });
    entriesSheet.getRow(1).font = { bold: true };
    entriesSheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  if (!entities.length) {
    const sheet = workbook.addWorksheet(fallback);
    sheet.addRow(["No data"]);
  }
  return workbook.xlsx.writeBuffer().then((buffer) => new Uint8Array(buffer));
}

export async function buildFullBackupZip(data: BackupData) {
  const projects = data.projects.map((project) => ({ name: project.name, entries: project.entries, metadata: [["Project ID", project.id], ["Name", project.name], ["Description", project.description], ["Color", project.color], ["Archived", project.archived], ["Team ID", project.team?.id ?? ""], ["Team", project.team?.name ?? ""]] as Array<[string, string | boolean]> }));
  const people = data.people.map((person) => ({ name: person.name, entries: person.entries.map((entry) => ({ ...entry, user: { id: person.id, name: person.name, email: person.email } })), metadata: [["Person ID", person.id], ["Name", person.name], ["Email", person.email], ["Role", person.role], ["Deactivated at", person.deactivatedAt?.toISOString() ?? ""]] as Array<[string, string | boolean]> }));
  const teams = data.teams.map((team) => ({ name: team.name, entries: team.projects.flatMap((project) => project.entries.map((entry) => ({ ...entry, project: { id: project.id, name: project.name } }))), metadata: [["Team ID", team.id], ["Name", team.name], ["Description", team.description], ["Color", team.color], ["Members", team.members.map((member) => `${member.user.name} <${member.user.email}>`).join(", ")], ["Projects", team.projects.map((project) => `${project.name} (${project.id})`).join(", ")]] as Array<[string, string | boolean]> }));
  const [projectFile, peopleFile, teamFile] = await Promise.all([makeWorkbook(projects, "Projects"), makeWorkbook(people, "People"), makeWorkbook(teams, "Teams")]);
  return zipSync({ "ora-projects.xlsx": projectFile, "ora-people.xlsx": peopleFile, "ora-teams.xlsx": teamFile });
}
