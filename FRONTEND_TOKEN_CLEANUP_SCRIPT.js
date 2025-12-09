// 前端Token清理脚本
// 在浏览器开发者工具控制台中执行

(function clearInvalidTokens() {
    console.log('🔧 开始清理GEO平台无效Token...');

    // 1. 清理localStorage中的认证信息
    const localStorageKeys = [
        'geo_auth',
        'geo_user_token',
        'geo_user_info',
        'auth_token',
        'user_token',
        'token',
        'jwt_token'
    ];

    let localStorageCleared = 0;
    localStorageKeys.forEach(key => {
        if (localStorage.getItem(key)) {
            const value = localStorage.getItem(key);
            console.log(`🗑️  清理localStorage: ${key} (${value?.length || 0} 字符)`);
            localStorage.removeItem(key);
            localStorageCleared++;
        }
    });

    // 2. 清理sessionStorage
    const sessionStorageKeys = [
        'geo_auth',
        'geo_user_token',
        'auth_token'
    ];

    let sessionStorageCleared = 0;
    sessionStorageKeys.forEach(key => {
        if (sessionStorage.getItem(key)) {
            console.log(`🗑️  清理sessionStorage: ${key}`);
            sessionStorage.removeItem(key);
            sessionStorageCleared++;
        }
    });

    // 3. 清理可能的无效token（基于错误模式）
    const allKeys = Object.keys(localStorage);
    let suspiciousKeys = 0;

    allKeys.forEach(key => {
        try {
            const value = localStorage.getItem(key);
            if (value && (
                value.startsWith('test_token') ||
                value.startsWith('invalid_token') ||
                value.startsWith('dummy_token') ||
                value.startsWith('mock_token') ||
                value.length < 50 || // 正常JWT通常有100+字符
                (value.includes('token') && value.length < 100)
            )) {
                console.log(`🚨 清理可疑Token: ${key} = "${value.substring(0, 30)}..."`);
                localStorage.removeItem(key);
                suspiciousKeys++;
            }
        } catch (e) {
            // 忽略解析错误
        }
    });

    // 4. 报告清理结果
    console.log('\n📊 Token清理完成!');
    console.log(`✅ localStorage清理: ${localStorageCleared} 个项目`);
    console.log(`✅ sessionStorage清理: ${sessionStorageCleared} 个项目`);
    console.log(`✅ 可疑Token清理: ${suspiciousKeys} 个项目`);

    // 5. 提供后续操作建议
    console.log('\n🎯 后续操作建议:');
    console.log('1. 刷新页面: location.reload()');
    console.log('2. 重新登录使用有效凭据');
    console.log('3. 检查新Token格式是否正确');

    // 6. 提供便捷操作
    if (confirm('是否立即刷新页面并清理所有缓存？')) {
        // 清理所有缓存并刷新
        localStorage.clear();
        sessionStorage.clear();
        console.log('🔄 所有缓存已清理，页面即将刷新...');

        // 刷新页面
        setTimeout(() => {
            location.reload();
        }, 1000);
    } else {
        console.log('ℹ️  可以手动执行 location.reload() 刷新页面');
    }

    return {
        localStorageCleared,
        sessionStorageCleared,
        suspiciousKeys,
        totalCleared: localStorageCleared + sessionStorageCleared + suspiciousKeys
    };
})();