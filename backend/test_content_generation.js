require('dotenv').config();
const { contentQueue } = require('./queue');
const logger = require('./logger');

async function testContentGeneration() {
  console.log('🔍 测试内容生成队列系统...');
  console.log('=====================================\n');

  try {
    // 1. 检查队列状态
    console.log('1. 检查队列连接状态...');
    const queueInfo = await contentQueue.getJobCounts();
    console.log('✅ 队列连接成功');
    console.log('   队列统计:', queueInfo);
    console.log('');

    // 2. 测试添加任务
    console.log('2. 测试添加内容生成任务...');
    const testJobData = {
      keyword: '测试关键词',
      userId: 1,
      knowledgeBaseId: null,
      knowledgeSetId: null,
      imageIds: [],
      ruleId: null,
      schemaConfig: {},
      schemaEntities: {},
      schemaOverrides: null,
    };

    const job = await contentQueue.add('generate-content', testJobData);
    console.log('✅ 任务添加成功');
    console.log('   任务ID:', job.id);
    console.log('   任务数据:', JSON.stringify(testJobData, null, 2));
    console.log('');

    // 3. 等待一下让worker处理
    console.log('3. 等待Worker处理任务...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. 检查任务状态
    console.log('4. 检查任务执行状态...');
    const jobState = await job.getState();
    const jobProgress = await job.getProgress();
    const jobResult = await job.returnvalue;

    console.log('   任务状态:', jobState);
    console.log('   任务进度:', jobProgress);
    if (jobResult) {
      console.log('   任务结果:', jobResult);
    }
    console.log('');

    // 5. 检查最终队列状态
    console.log('5. 检查最终队列状态...');
    const finalQueueInfo = await contentQueue.getJobCounts();
    console.log('   最终队列统计:', finalQueueInfo);

    // 6. 清理测试任务
    if (jobState === 'completed') {
      await job.remove();
      console.log('✅ 测试任务已清理');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('   错误详情:', error);
  }

  console.log('\n=====================================');
  console.log('🏁 内容生成队列测试完成');
}

// 运行测试
testContentGeneration().catch(console.error);