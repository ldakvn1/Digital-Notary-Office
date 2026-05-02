const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const duplicates = await prisma.user.groupBy({
    by: ["email"],
    _count: { email: true },
    where: { email: { not: null } },
    having: { email: { _count: { gt: 1 } } },
  });

  if (!duplicates.length) {
    console.log("NO_DUPLICATE_EMAIL");
    return;
  }

  const emails = duplicates.map((item) => item.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      username: true,
      email: true,
      role: true,
      isActive: true,
    },
    orderBy: [{ email: "asc" }, { username: "asc" }],
  });

  console.log(
    JSON.stringify(
      {
        duplicateEmailGroups: duplicates.map((item) => ({
          email: item.email,
          count: item._count.email,
        })),
        users,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
