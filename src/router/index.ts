import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/components/layout/AppLayout.vue'),
      children: [
        { path: '', redirect: '/ai-admin' },
        {
          path: 'ai-admin',
          name: 'ai-admin',
          component: () => import('@/views/admin/AiAdminWireframeView.vue'),
        },
        {
          path: 'websocket',
          name: 'websocket',
          component: () => import('@/views/test/WebSocketTestView.vue'),
        },
        {
          path: 'file-upload',
          name: 'file-upload',
          component: () => import('@/views/test/FileUploadTestView.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
