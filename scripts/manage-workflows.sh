#!/bin/bash

# GitHub Actions工作流管理脚本
# 用途：管理保活工作流，避免冲突和重复执行

echo "🔧 GEO后端保活工作流管理脚本"
echo "📅 执行时间: $(date)"
echo ""

# 定义工作流文件路径
WORKFLOW_DIR=".github/workflows"
KEEPALIVE_FILES=(
    "$WORKFLOW_DIR/backend-keepalive.yml"
    "$WORKFLOW_DIR/backend-keepalive-fixed.yml"
    "$WORKFLOW_DIR/backend-keepalive-old.yml"
    "$WORKFLOW_DIR/backend-keepalive-optimized.yml"
)

# 函数：检查工作流文件状态
check_workflow_status() {
    echo "📋 当前工作流文件状态:"
    echo "============================"

    for file in "${KEEPALIVE_FILES[@]}"; do
        if [ -f "$file" ]; then
            status="✅ 存在"
            if [[ "$file" == *"optimized"* ]]; then
                status="🚀 推荐"
            fi
            if [[ "$file" == *"old"* ]]; then
                status="⚠️ 旧版本"
            fi
            echo "$status $(basename "$file")"
        else
            echo "❌ 不存在 $(basename "$file")"
        fi
    done
    echo ""
}

# 函数：激活优化版工作流
activate_optimized() {
    echo "🚀 激活优化版工作流..."

    # 检查优化版是否存在
    if [ ! -f "${KEEPALIVE_FILES[3]}" ]; then
        echo "❌ 优化版工作流文件不存在"
        return 1
    fi

    # 备份当前活跃的工作流
    echo "💾 备份当前活跃工作流..."
    for file in "${KEEPALIVE_FILES[@]}"; do
        if [ -f "$file" ] && [[ "$file" != *"optimized"* ]]; then
            if [[ "$file" != *"old"* ]]; then
                mv "$file" "${file}.backup.$(date +%Y%m%d_%H%M%S)"
                echo "📦 已备份: $(basename "$file")"
            fi
        fi
    done

    echo "✅ 优化版工作流已激活"
    echo "🎯 下次执行将使用: $(basename "${KEEPALIVE_FILES[3]}")"
}

# 函数：清理旧工作流
cleanup_old_workflows() {
    echo "🧹 清理旧工作流文件..."

    removed=0
    for file in "${KEEPALIVE_FILES[@]}"; do
        if [ -f "$file" ]; then
            # 检查是否为旧版本或备份文件
            if [[ "$file" == *"old"* ]] || [[ "$file" == *".backup"* ]]; then
                echo "🗑️ 删除: $(basename "$file")"
                rm "$file"
                ((removed++))
            fi
        fi
    done

    echo "✅ 已清理 $removed 个旧工作流文件"
}

# 函数：测试工作流语法
test_workflow_syntax() {
    echo "🧪 测试工作流语法..."

    for file in "${KEEPALIVE_FILES[@]}"; do
        if [ -f "$file" ]; then
            echo "🔍 检查: $(basename "$file")"

            # 简单的YAML语法检查
            if python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
                echo "  ✅ 语法正确"
            else
                echo "  ❌ 语法错误"
                echo "  💡 请检查YAML格式和缩进"
            fi
        fi
    done
}

# 函数：生成工作流报告
generate_report() {
    echo "📊 生成工作流状态报告..."

    report_file="workflow-status-report.md"
    cat > "$report_file" << EOF
# GitHub Actions工作流状态报告

**生成时间**: $(date '+%Y-%m-%d %H:%M:%S')

## 当前活跃工作流

EOF

    active_found=false
    for file in "${KEEPALIVE_FILES[@]}"; do
        if [ -f "$file" ] && [[ "$file" != *".backup"* ]]; then
            active_found=true
            echo "### $(basename "$file")" >> "$report_file"
            echo "- **状态**: 存在" >> "$report_file"

            if [[ "$file" == *"optimized"* ]]; then
                echo "- **推荐**: ✅ 最佳选择" >> "$report_file"
            elif [[ "$file" == *"old"* ]]; then
                echo "- **状态**: ⚠️ 旧版本，建议删除" >> "$report_file"
            else
                echo "- **状态**: 🔄 使用中" >> "$report_file"
            fi

            # 提取cron信息
            cron=$(grep -A1 "schedule:" "$file" | grep "cron:" | head -1 | sed 's/.*: //' | sed 's/[^a-zA-Z0-9_* ]//g')
            if [ ! -z "$cron" ]; then
                echo "- **调度**: $cron" >> "$report_file"
            fi

            echo "" >> "$report_file"
        fi
    done

    if [ "$active_found" = false ]; then
        echo "❌ 未找到活跃的工作流文件" >> "$report_file"
    fi

    cat >> "$report_file" << EOF
## 建议

1. ✅ 使用 \`backend-keepalive-optimized.yml\` 作为主要工作流
2. 🗑️ 删除旧版本工作流避免冲突
3. 🧪 定期检查工作流执行状态
4. 📊 监控服务可用性

## 执行频率建议

- **免费Render服务**: 每14分钟执行一次
- **付费Render服务**: 可调整为30分钟或更长时间
- **手动触发**: 根据需要立即执行

---
*此报告由工作流管理脚本自动生成*
EOF

    echo "✅ 报告已生成: $report_file"
}

# 函数：显示帮助信息
show_help() {
    echo "📖 使用方法:"
    echo ""
    echo "  $0 [命令]"
    echo ""
    echo "📋 可用命令:"
    echo "  status     - 显示当前工作流状态"
    echo "  optimize   - 激活优化版工作流"
    echo "  cleanup    - 清理旧工作流文件"
    echo "  test       - 测试工作流语法"
    echo "  report     - 生成状态报告"
    echo "  all        - 执行完整优化流程"
    echo "  help       - 显示此帮助信息"
    echo ""
    echo "🎯 推荐执行:"
    echo "  $0 all     # 完整优化流程"
}

# 主执行逻辑
case "${1:-help}" in
    "status")
        check_workflow_status
        ;;
    "optimize")
        check_workflow_status
        activate_optimized
        ;;
    "cleanup")
        cleanup_old_workflows
        ;;
    "test")
        test_workflow_syntax
        ;;
    "report")
        generate_report
        ;;
    "all")
        echo "🚀 执行完整优化流程..."
        check_workflow_status
        test_workflow_syntax
        activate_optimized
        cleanup_old_workflows
        generate_report
        echo ""
        echo "✅ 优化流程完成！"
        echo "💡 建议提交更改到Git仓库"
        ;;
    "help"|*)
        show_help
        ;;
esac

echo ""
echo "🎉 工作流管理脚本执行完成"