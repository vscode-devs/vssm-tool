/**
 * @file 强制同步本地分支到远端（丢弃所有未推送的本地改动，谨慎使用）
 * @usage node scripts/sync-force.mjs  或  npm run git-sync-force
 */
import { execSync } from 'node:child_process';

const branch = execSync('git symbolic-ref --short HEAD').toString().trim();
execSync('git fetch origin', { stdio: 'inherit' });
execSync(`git reset --hard origin/${branch}`, { stdio: 'inherit' });
