require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const INITIAL_EMPLOYEES = [
  { employeeId: 'TECHE1003', name: 'Vipin T V' },
  { employeeId: 'TECHE1004', name: 'Shahla Hana Shafri M' },
  { employeeId: 'TECHE1007', name: 'Sandeep P' },
  { employeeId: 'TECHE1016', name: 'Fathimath Ramseena P M' },
  { employeeId: 'TECHE1018', name: 'Devika T' },
  { employeeId: 'TECHE1019', name: 'Krishnan S Nair' },
  { employeeId: 'TECHE1020', name: 'Athira' },
  { employeeId: 'TECHE1021', name: 'Pratheeksha' }
];

async function seedEmployeesIfEmpty() {
  const count = await Employee.countDocuments();
  if (count === 0) {
    await Employee.insertMany(INITIAL_EMPLOYEES);
    console.info(`[Seed] Inserted ${INITIAL_EMPLOYEES.length} initial TechE Education employees.`);
    return INITIAL_EMPLOYEES.length;
  }
  return 0;
}

if (require.main === module) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required to run seedEmployees.js');
    process.exit(1);
  }
  mongoose
    .connect(uri)
    .then(async () => {
      const inserted = await seedEmployeesIfEmpty();
      console.info(
        inserted > 0
          ? `Seed completed (${inserted} employees added).`
          : 'Employee collection already populated. No changes made.'
      );
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = {
  INITIAL_EMPLOYEES,
  seedEmployeesIfEmpty
};

