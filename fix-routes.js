const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/app/api/school/**/*.ts');
files.push('src/app/actions/school.ts');
files.push('src/lib/school.ts');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/const (\w+) = await requireApiAuth\((?:req|request)?\);/g, 'const authResult = await requireApiAuth();\n    if (authResult.response) return authResult.response;\n    const $1 = authResult.user;');
  
  if (file === 'src/lib/school.ts') {
    content = content.replace(/const schoolIds = schools\.map\(s => s\._id\);/g, 'const schoolIds = schools.map(s => s._id).filter(id => id !== undefined) as any;');
    content = content.replace(/school_id: \{ \$in: schoolIds \}/g, 'school_id: { $in: schoolIds.map(id => id.toString()) }');
  }

  if (file === 'src/app/actions/school.ts') {
    content = content.replace(/user\.name/g, 'user.email');
  }

  fs.writeFileSync(file, content);
}