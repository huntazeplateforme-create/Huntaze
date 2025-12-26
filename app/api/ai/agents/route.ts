import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

// Force dynamic rendering to avoid build-time evaluation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Lazy import to avoid build-time instantiation
  const { AzureMultiAgentService } = await import('@/lib/services/azureMultiAgentService');
  
  // Initialize service as singleton
  let multiAgentService: InstanceType<typeof AzureMultiAgentService> | null = null;

  function getMultiAgentService(): InstanceType<typeof AzureMultiAgentService> {
    if (!multiAgentService) {
      multiAgentService = new AzureMultiAgentService();
    }
    return multiAgentService;
  }
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { message, context, directAction } = body;

    // Validation
    if (!message && !directAction) {
      return NextResponse.json(
        { error: 'Message or direct action is required' },
        { status: 400 }
      );
    }

    const service = getMultiAgentService();

    // Handle direct action execution
    if (directAction) {
      const { agentKey, action, params } = directAction;

      if (!agentKey || !action) {
        return NextResponse.json(
          { error: 'Agent key and action are required for direct action' },
          { status: 400 }
        );
      }

      try {
        const result = await service.executeDirectAction(
          agentKey,
          action,
          { ...params, userId }
        );

        return NextResponse.json({
          type: 'direct_action',
          agentKey,
          action,
          result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage.includes('not found')) {
          return NextResponse.json(
            { error: errorMessage },
            { status: 404 }
          );
        }

        if (errorMessage.includes('not available')) {
          return NextResponse.json(
            { error: errorMessage },
            { status: 400 }
          );
        }

        throw error;
      }
    }

    // Handle natural language processing
    if (message) {
      const response = await service.processUserRequest(
        message,
        userId,
        context
      );

      return NextResponse.json({
        type: 'natural_language',
        message: response,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    );

  } catch (error) {
    console.error('AI agents API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Lazy import to avoid build-time instantiation
    const { AzureMultiAgentService } = await import('@/lib/services/azureMultiAgentService');
    const service = new AzureMultiAgentService();
    const agents = await service.getAvailableAgents();

    return NextResponse.json({
      agents,
      totalAgents: agents.length,
      capabilities: agents.reduce((acc, agent) => acc + agent.actions.length, 0)
    });
  } catch (error) {
    console.error('Get agents error:', error);

    return NextResponse.json(
      { error: 'Failed to get agents' },
      { status: 500 }
    );
  }
}
