// CommonJS is required because this script is executed as a standalone .cjs file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require("exceljs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const outputDir = process.argv[2];

if (!outputDir) {
  console.error("Usage: node scripts/export-uninstall-data.cjs <output-directory>");
  process.exit(2);
}

async function writeWorkbook(fileName, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  await workbook.xlsx.writeFile(path.join(outputDir, fileName));
}

async function main() {
  // Use raw SQL so the export remains independent of generated Prisma model delegates.
  // Password hashes and other authentication secrets are intentionally excluded.
  const [projects, teams, users] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT p.name, p.description, p.color, p.archived, t.name AS team, p.createdAt,
      (SELECT group_concat(u.name || ' <' || u.email || '> ', ', ') FROM ProjectMember pm JOIN User u ON u.id = pm.userId WHERE pm.projectId = p.id) AS members
      FROM Project p LEFT JOIN Team t ON t.id = p.teamId ORDER BY p.name`),
    prisma.$queryRawUnsafe(`SELECT t.name, t.description, t.color, t.createdAt,
      (SELECT group_concat(u.name || ' <' || u.email || '> ', ', ') FROM TeamMember tm JOIN User u ON u.id = tm.userId WHERE tm.teamId = t.id) AS members,
      (SELECT group_concat(p.name, ', ') FROM Project p WHERE p.teamId = t.id) AS projects
      FROM Team t ORDER BY t.name`),
    prisma.$queryRawUnsafe(`SELECT u.name, u.email, u.role, u.createdAt,
      (SELECT group_concat(t.name, ', ') FROM TeamMember tm JOIN Team t ON t.id = tm.teamId WHERE tm.userId = u.id) AS teams,
      (SELECT group_concat(p.name, ', ') FROM ProjectMember pm JOIN Project p ON p.id = pm.projectId WHERE pm.userId = u.id) AS projects
      FROM User u ORDER BY u.name`),
  ]);

  await writeWorkbook("Ora-Projects.xlsx", "Projects", [
    { header: "Name", key: "name", width: 30 },
    { header: "Description", key: "description", width: 50 },
    { header: "Color", key: "color", width: 14 },
    { header: "Archived", key: "archived", width: 12 },
    { header: "Team", key: "team", width: 30 },
    { header: "Members", key: "members", width: 50 },
    { header: "Created at", key: "createdAt", width: 24 },
  ], projects.map((item) => ({
    name: item.name, description: item.description, color: item.color, archived: Boolean(item.archived),
    team: item.team ?? "", members: item.members ?? "", createdAt: item.createdAt,
  })));

  await writeWorkbook("Ora-Teams.xlsx", "Teams", [
    { header: "Name", key: "name", width: 30 },
    { header: "Description", key: "description", width: 50 },
    { header: "Color", key: "color", width: 14 },
    { header: "Members", key: "members", width: 50 },
    { header: "Projects", key: "projects", width: 50 },
    { header: "Created at", key: "createdAt", width: 24 },
  ], teams.map((item) => ({
    name: item.name, description: item.description, color: item.color,
    members: item.members ?? "", projects: item.projects ?? "", createdAt: item.createdAt,
  })));

  await writeWorkbook("Ora-Users.xlsx", "Users", [
    { header: "Name", key: "name", width: 30 },
    { header: "Email", key: "email", width: 40 },
    { header: "Role", key: "role", width: 16 },
    { header: "Teams", key: "teams", width: 50 },
    { header: "Projects", key: "projects", width: 50 },
    { header: "Created at", key: "createdAt", width: 24 },
  ], users.map((item) => ({
    name: item.name, email: item.email, role: item.role,
    teams: item.teams ?? "", projects: item.projects ?? "", createdAt: item.createdAt,
  })));

  console.log(`Exported ${projects.length} projects, ${teams.length} teams, and ${users.length} users to ${outputDir}`);
}

main().catch((error) => {
  console.error("Could not export uninstall data:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
