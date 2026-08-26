/**
 * @file init-project 模块共享契约
 * @module cmd/init-project/types
 */

/**
 * @brief 拷贝明细报告（供 postCopy 钩子区分"全新创建"与"目标已存在"）
 * @interface TemplateCopyReport
 * @property created 本次实际创建的相对路径列表
 * @property existed 因已存在而跳过的相对路径列表
 */
export interface TemplateCopyReport {
  created: string[];
  existed: string[];
}

/**
 * @brief 模板目录拷贝结果
 * @interface TemplateCopyResult
 * @property copied 是否至少成功拷贝了一个文件或目录
 * @property skipped 是否存在因目标已存在而被跳过的情况
 * @property report 拷贝明细（新建/已存在的相对路径）
 */
export interface TemplateCopyResult {
  copied: boolean;
  skipped: boolean;
  report: TemplateCopyReport;
}

/**
 * @brief postCopy 钩子上下文
 * @interface TemplatePostCopyContext
 * @property resourceRoot 运行时资源根目录
 * @property templateDir 本次使用的模板目录绝对路径
 * @property targetRoot 工作区根目录绝对路径
 * @property report 拷贝明细报告
 */
export interface TemplatePostCopyContext {
  resourceRoot: string;
  templateDir: string;
  targetRoot: string;
  report: TemplateCopyReport;
}

/**
 * @brief 工程模板配置
 * @interface ProjectTemplateConfig
 * @property templateRelPath 模板目录（相对运行时资源根 out/）
 * @property specialTargets 特殊目标名 → 源文件（相对运行时资源根）的映射表
 * @property postCopy 可选拷贝后处理钩子（携带模板与目标路径及拷贝明细）
 */
export interface ProjectTemplateConfig {
  templateRelPath: string;
  specialTargets: Record<string, string>;
  postCopy?(ctx: TemplatePostCopyContext): Promise<void>;
}
